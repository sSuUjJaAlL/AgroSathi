from __future__ import annotations

import os
from datetime import datetime
from urllib.parse import urlparse

import numpy as np
import pandas as pd
from pymongo import MongoClient
from sklearn.impute import KNNImputer
from sklearn.preprocessing import MinMaxScaler


def db_name_from_uri(uri: str) -> str:
    path = urlparse(uri).path.lstrip("/")
    return path or "agri_price_nepal"


def get_mongo_db():
    uri = os.environ.get("MONGODB_URI", "mongodb://localhost:27017/agri_price_nepal")
    client = MongoClient(uri)
    return client[db_name_from_uri(uri)]


def _coerce_record(r: dict) -> dict:
    """Convert numpy/pandas types to plain Python for MongoDB."""
    out = {}
    for k, v in r.items():
        if isinstance(v, (np.integer,)):
            out[k] = int(v)
        elif isinstance(v, (np.floating,)):
            out[k] = None if np.isnan(v) else float(v)
        elif isinstance(v, float) and np.isnan(v):
            out[k] = None
        elif isinstance(v, pd.Timestamp):
            out[k] = v.to_pydatetime()
        else:
            out[k] = v
    return out


def remove_iqr_outliers(df: pd.DataFrame, col: str = "avg_price", multiplier: float = 1.5) -> pd.DataFrame:
    def _iqr_mask(s: pd.Series) -> pd.Series:
        q1, q3 = s.quantile(0.25), s.quantile(0.75)
        iqr = q3 - q1
        return (s >= q1 - multiplier * iqr) & (s <= q3 + multiplier * iqr)
    mask = df.groupby("item_name")[col].transform(_iqr_mask)
    n_removed = int((~mask).sum())
    if n_removed > 0:
        print(f"[ML] IQR outlier removal: dropped {n_removed} rows ({col}).")
    return df[mask].reset_index(drop=True)


def store_preprocessed_features(full: pd.DataFrame, meta: dict) -> None:
    db = get_mongo_db()
    records = [_coerce_record(r) for r in full.to_dict("records")]
    db["preprocessed_features"].drop()
    if records:
        db["preprocessed_features"].insert_many(records)
    db["preprocessed_meta"].replace_one(
        {"_id": "latest"},
        {"_id": "latest", "computed_at": datetime.utcnow(), "row_count": len(records), "meta": meta},
        upsert=True,
    )
    print(f"[ML] Stored {len(records)} preprocessed rows to MongoDB.")


def load_preprocessed_features() -> tuple[pd.DataFrame, pd.DataFrame, dict] | None:
    """Load cached preprocessed feature frame if computed today (UTC)."""
    db = get_mongo_db()
    entry = db["preprocessed_meta"].find_one({"_id": "latest"})
    if not entry:
        return None
    computed_at: datetime = entry["computed_at"]
    if computed_at.date() != datetime.utcnow().date():
        return None
    records = list(db["preprocessed_features"].find({}, {"_id": 0}))
    if not records:
        return None
    full = pd.DataFrame(records)
    if "date" in full.columns:
        full["date"] = pd.to_datetime(full["date"])
    train_df = full.dropna(subset=["target_next"])
    meta: dict = entry.get("meta", {"imputed_cells": 0, "notes": ["Loaded from cache"]})
    print(f"[ML] Loaded {len(full)} preprocessed rows from MongoDB cache (computed {computed_at.date()}).")
    return train_df, full, meta


def load_raw_frames():
    db = get_mongo_db()
    cutoff = pd.Timestamp("2017-01-01")

    crops_raw = list(db["crop_prices"].find({"isOutlier": {"$ne": True}}, {"_id": 0}))
    crops = pd.DataFrame(crops_raw)
    if not crops.empty and "date" in crops.columns:
        crops["date"] = pd.to_datetime(crops["date"]).dt.normalize()
        crops = crops[crops["date"] >= cutoff]

    weather = pd.DataFrame(list(db["weather_data"].find({}, {"_id": 0})))

    # Primary: fuel_prices (normalized). Fallback: fuel_data (old schema).
    fuel_raw = list(db["fuel_prices"].find({"fuel_type": "diesel"}, {"_id": 0, "date": 1, "price_npr": 1}))
    if fuel_raw:
        fuel = pd.DataFrame(fuel_raw).rename(columns={"price_npr": "diesel_price"})
    else:
        old_fuel = list(db["fuel_data"].find({}, {"_id": 0, "date": 1, "diesel_price": 1}))
        fuel = pd.DataFrame(old_fuel) if old_fuel else pd.DataFrame(columns=["date", "diesel_price"])

    return crops, weather, fuel


def merge_feature_frame(force: bool = False) -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    if not force:
        cached = load_preprocessed_features()
        if cached is not None:
            _train, _full, _meta = cached
            # Invalidate cache if new feature/target columns are missing
            required_new = ["price_change_1d", "price_change_7d", "target_1d"]
            if all(c in _full.columns for c in required_new):
                return cached
            print("[ML] Cache missing new columns — recomputing.")


    crops, weather, fuel = load_raw_frames()
    meta: dict = {"imputed_cells": 0, "notes": []}

    if crops.empty:
        raise ValueError("No crop_prices in MongoDB. Seed historical data or run the scraper.")

    crops["date"] = pd.to_datetime(crops["date"]).dt.normalize()

    # IQR outlier removal per crop (algorithm 1)
    before_iqr = len(crops)
    crops = remove_iqr_outliers(crops, col="avg_price", multiplier=1.5)
    meta["iqr_removed"] = before_iqr - len(crops)

    weather_cols = {"date", "temperature", "rainfall", "humidity"}
    if weather.empty or not weather_cols.issubset(set(weather.columns)):
        w = pd.DataFrame(columns=["date", "temperature", "rainfall", "humidity"])
        meta["notes"].append("No weather_data — features imputed from crop series only.")
    else:
        weather = weather.copy()
        weather["date"] = pd.to_datetime(weather["date"]).dt.normalize()
        w = weather[["date", "temperature", "rainfall", "humidity"]]

    if fuel.empty or "diesel_price" not in fuel.columns or "date" not in fuel.columns:
        f = pd.DataFrame(columns=["date", "diesel_price"])
        meta["notes"].append("No fuel data — diesel feature imputed.")
    else:
        fuel = fuel.copy()
        fuel["date"] = pd.to_datetime(fuel["date"]).dt.normalize()
        f = fuel[["date", "diesel_price"]].drop_duplicates("date")

    merged = crops.merge(w, on="date", how="left")
    merged = merged.merge(f, on="date", how="left")

    merged = merged.sort_values(["item_name", "date"])

    # Extract temporal features before imputation (needed as KNN anchors)
    merged["day"] = merged["date"].dt.day
    merged["month"] = merged["date"].dt.month

    # KNN imputation for weather/fuel gaps (algorithm 2)
    # Uses avg_price + month + day as distance anchors, scaled to [0,1] so price doesn't dominate
    impute_cols = ["temperature", "rainfall", "humidity", "diesel_price"]
    before_knn = int(merged[impute_cols].isna().sum().sum())
    if before_knn > 0:
        knn_cols = ["avg_price", "month", "day"] + impute_cols
        scaler = MinMaxScaler()
        scaled = scaler.fit_transform(merged[knn_cols])
        knn_imp = KNNImputer(n_neighbors=5)
        imputed_scaled = knn_imp.fit_transform(scaled)
        imputed_orig = scaler.inverse_transform(imputed_scaled)
        imputed_df = pd.DataFrame(imputed_orig, columns=knn_cols, index=merged.index)
        for col in impute_cols:
            merged[col] = imputed_df[col]
        after_knn = int(merged[impute_cols].isna().sum().sum())
        meta["imputed_cells"] = before_knn - after_knn
        if after_knn > 0:
            # Fallback: median for any edge cases KNN couldn't resolve
            for col in impute_cols:
                merged[col] = merged[col].fillna(merged[col].median())
            meta["notes"].append("Residual missing values filled with global median after KNN.")
    else:
        meta["imputed_cells"] = 0

    # Cyclical month encoding
    merged["month_sin"] = np.sin(2 * np.pi * merged["month"] / 12)
    merged["month_cos"] = np.cos(2 * np.pi * merged["month"] / 12)

    # Price lags
    merged["lag_1_price"] = merged.groupby("item_name")["avg_price"].shift(1)
    merged["lag_7_price"] = merged.groupby("item_name")["avg_price"].shift(7)
    merged["lag_14_price"] = merged.groupby("item_name")["avg_price"].shift(14)
    merged["lag_30_price"] = merged.groupby("item_name")["avg_price"].shift(30)

    # Rolling stats
    merged["moving_avg_7"] = merged.groupby("item_name")["avg_price"].transform(
        lambda s: s.rolling(7, min_periods=1).mean()
    )
    merged["moving_avg_30"] = merged.groupby("item_name")["avg_price"].transform(
        lambda s: s.rolling(30, min_periods=1).mean()
    )
    merged["price_std_30"] = merged.groupby("item_name")["avg_price"].transform(
        lambda s: s.rolling(30, min_periods=3).std().fillna(0)
    )

    # Fuel-derived features
    merged["diesel_price_7d_change_pct"] = merged.groupby("item_name")["diesel_price"].transform(
        lambda s: s.pct_change(periods=7).fillna(0) * 100
    )
    merged["diesel_price_30d_ma"] = merged.groupby("item_name")["diesel_price"].transform(
        lambda s: s.rolling(30, min_periods=1).mean()
    )

    # Festival season flag (Dashain/Tihar: Oct–Nov)
    merged["is_festival_season"] = merged["month"].isin([10, 11]).astype(int)

    # Weather rolling
    merged["rainfall_7d_sum"] = merged.groupby("item_name")["rainfall"].transform(
        lambda s: s.rolling(7, min_periods=1).sum()
    )

    # Momentum features — rate of change signals (help model detect rising/falling trends)
    merged["price_change_1d"] = merged.groupby("item_name")["avg_price"].transform(
        lambda s: s.pct_change(1).fillna(0) * 100
    )
    merged["price_change_7d"] = merged.groupby("item_name")["avg_price"].transform(
        lambda s: s.pct_change(7).fillna(0) * 100
    )

    merged["target_next"] = merged.groupby("item_name")["avg_price"].shift(-1)

    # Direct multi-step targets for horizon forecasting (no recursive compounding)
    for h in range(1, 31):
        merged[f"target_{h}d"] = merged.groupby("item_name")["avg_price"].shift(-h)

    full = merged.dropna(subset=["lag_1_price", "lag_7_price", "moving_avg_7", "moving_avg_30"])
    train_df = full.dropna(subset=["target_next"])

    store_preprocessed_features(full, meta)
    return train_df, full, meta


# RandomForest features (raw, no scaling needed)
FEATURE_COLUMNS = [
    "item_encoded",
    "day",
    "month",
    "month_sin",
    "month_cos",
    "lag_1_price",
    "lag_7_price",
    "lag_14_price",
    "lag_30_price",
    "moving_avg_7",
    "moving_avg_30",
    "price_std_30",
    "price_change_1d",
    "price_change_7d",
    "temperature",
    "rainfall",
    "humidity",
    "rainfall_7d_sum",
    "diesel_price",
    "diesel_price_7d_change_pct",
    "diesel_price_30d_ma",
    "is_festival_season",
]

# LSTM sequence features (normalized subset, no item_encoded since per-item models)
LSTM_FEATURE_COLUMNS = [
    "avg_price",
    "diesel_price",
    "temperature",
    "rainfall",
    "month_sin",
    "month_cos",
    "is_festival_season",
]
