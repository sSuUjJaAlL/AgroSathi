from __future__ import annotations

import os
from urllib.parse import urlparse

import numpy as np
import pandas as pd
from pymongo import MongoClient


def db_name_from_uri(uri: str) -> str:
    path = urlparse(uri).path.lstrip("/")
    return path or "agri_price_nepal"


def get_mongo_db():
    uri = os.environ.get("MONGODB_URI", "mongodb://localhost:27017/agri_price_nepal")
    client = MongoClient(uri)
    return client[db_name_from_uri(uri)]


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


def merge_feature_frame() -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    crops, weather, fuel = load_raw_frames()
    meta: dict = {"imputed_cells": 0, "notes": []}

    if crops.empty:
        raise ValueError("No crop_prices in MongoDB. Seed historical data or run the scraper.")

    crops["date"] = pd.to_datetime(crops["date"]).dt.normalize()

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

    # Forward-fill fuel and weather gaps
    before = merged[["temperature", "rainfall", "humidity", "diesel_price"]].isna().sum().sum()
    for col in ["temperature", "rainfall", "humidity", "diesel_price"]:
        merged[col] = merged.groupby("item_name")[col].transform(lambda s: s.ffill().bfill())
    after_fill = merged[["temperature", "rainfall", "humidity", "diesel_price"]].isna().sum().sum()
    meta["imputed_cells"] = int(before - after_fill)
    if after_fill > 0:
        merged[["temperature", "rainfall", "humidity", "diesel_price"]] = merged[
            ["temperature", "rainfall", "humidity", "diesel_price"]
        ].fillna(merged[["temperature", "rainfall", "humidity", "diesel_price"]].median())
        meta["notes"].append("Residual missing values filled with global median.")

    merged = merged.sort_values(["item_name", "date"])

    # Basic features
    merged["day"] = merged["date"].dt.day
    merged["month"] = merged["date"].dt.month

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

    merged["target_next"] = merged.groupby("item_name")["avg_price"].shift(-1)

    full = merged.dropna(subset=["lag_1_price", "lag_7_price", "moving_avg_7", "moving_avg_30"])
    train_df = full.dropna(subset=["target_next"])

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
