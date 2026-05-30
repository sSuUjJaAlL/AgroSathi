# AgroPredict Nepal — Algorithm Source Code
### ML Service | Final Year Project — B.Sc. CSIT

> **Word tip:** Font Consolas 8.5pt, line spacing Exactly 10pt, margins 2cm → fits in ~25 pages.

---

## Algorithms Used

| Algorithm | File | Purpose |
|-----------|------|---------|
| Random Forest Regressor | `training.py` | 7-day & 30-day price forecasting (primary model) |
| Moving Average | `training.py` | Baseline comparison forecast |
| LSTM Neural Network | `lstm.py` | Sequential pattern learning for featured crops |
| Feature Engineering | `preprocessing.py` | Lag features, rolling stats, weather/fuel merge |

---

## ml-service/app/preprocessing.py

```python
from __future__ import annotations
import os
from urllib.parse import urlparse
import numpy as np
import pandas as pd
from pymongo import MongoClient

def get_mongo_db():
    uri = os.environ.get("MONGODB_URI", "mongodb://localhost:27017/agri_price_nepal")
    client = MongoClient(uri)
    path = urlparse(uri).path.lstrip("/")
    return client[path or "agri_price_nepal"]

def load_raw_frames():
    db = get_mongo_db()
    cutoff = pd.Timestamp("2017-01-01")
    crops_raw = list(db["crop_prices"].find({"isOutlier": {"$ne": True}}, {"_id": 0}))
    crops = pd.DataFrame(crops_raw)
    if not crops.empty and "date" in crops.columns:
        crops["date"] = pd.to_datetime(crops["date"]).dt.normalize()
        crops = crops[crops["date"] >= cutoff]
    weather = pd.DataFrame(list(db["weather_data"].find({}, {"_id": 0})))
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
        raise ValueError("No crop_prices in MongoDB.")
    crops["date"] = pd.to_datetime(crops["date"]).dt.normalize()

    weather_cols = {"date", "temperature", "rainfall", "humidity"}
    if weather.empty or not weather_cols.issubset(set(weather.columns)):
        w = pd.DataFrame(columns=["date", "temperature", "rainfall", "humidity"])
    else:
        weather["date"] = pd.to_datetime(weather["date"]).dt.normalize()
        w = weather[["date", "temperature", "rainfall", "humidity"]]

    if fuel.empty or "diesel_price" not in fuel.columns:
        f = pd.DataFrame(columns=["date", "diesel_price"])
    else:
        fuel["date"] = pd.to_datetime(fuel["date"]).dt.normalize()
        f = fuel[["date", "diesel_price"]].drop_duplicates("date")

    merged = crops.merge(w, on="date", how="left")
    merged = merged.merge(f, on="date", how="left")

    # Forward-fill fuel and weather gaps per item
    before = merged[["temperature", "rainfall", "humidity", "diesel_price"]].isna().sum().sum()
    for col in ["temperature", "rainfall", "humidity", "diesel_price"]:
        merged[col] = merged.groupby("item_name")[col].transform(lambda s: s.ffill().bfill())
    meta["imputed_cells"] = int(before - merged[["temperature", "rainfall", "humidity", "diesel_price"]].isna().sum().sum())
    merged[["temperature", "rainfall", "humidity", "diesel_price"]] = merged[
        ["temperature", "rainfall", "humidity", "diesel_price"]
    ].fillna(merged[["temperature", "rainfall", "humidity", "diesel_price"]].median())

    merged = merged.sort_values(["item_name", "date"])

    # Calendar features
    merged["day"] = merged["date"].dt.day
    merged["month"] = merged["date"].dt.month

    # Cyclical month encoding (avoids Dec→Jan discontinuity)
    merged["month_sin"] = np.sin(2 * np.pi * merged["month"] / 12)
    merged["month_cos"] = np.cos(2 * np.pi * merged["month"] / 12)

    # Price lag features
    merged["lag_1_price"]  = merged.groupby("item_name")["avg_price"].shift(1)
    merged["lag_7_price"]  = merged.groupby("item_name")["avg_price"].shift(7)
    merged["lag_14_price"] = merged.groupby("item_name")["avg_price"].shift(14)
    merged["lag_30_price"] = merged.groupby("item_name")["avg_price"].shift(30)

    # Rolling price statistics
    merged["moving_avg_7"]  = merged.groupby("item_name")["avg_price"].transform(lambda s: s.rolling(7,  min_periods=1).mean())
    merged["moving_avg_30"] = merged.groupby("item_name")["avg_price"].transform(lambda s: s.rolling(30, min_periods=1).mean())
    merged["price_std_30"]  = merged.groupby("item_name")["avg_price"].transform(lambda s: s.rolling(30, min_periods=3).std().fillna(0))

    # Fuel-derived features (transport cost pressure)
    merged["diesel_price_7d_change_pct"] = merged.groupby("item_name")["diesel_price"].transform(lambda s: s.pct_change(periods=7).fillna(0) * 100)
    merged["diesel_price_30d_ma"]        = merged.groupby("item_name")["diesel_price"].transform(lambda s: s.rolling(30, min_periods=1).mean())

    # Nepal festival season flag (Dashain/Tihar: Oct–Nov → demand spike)
    merged["is_festival_season"] = merged["month"].isin([10, 11]).astype(int)

    # Weather rolling
    merged["rainfall_7d_sum"] = merged.groupby("item_name")["rainfall"].transform(lambda s: s.rolling(7, min_periods=1).sum())

    # Target: next day's price
    merged["target_next"] = merged.groupby("item_name")["avg_price"].shift(-1)

    full      = merged.dropna(subset=["lag_1_price", "lag_7_price", "moving_avg_7", "moving_avg_30"])
    train_df  = full.dropna(subset=["target_next"])
    return train_df, full, meta


# Feature columns used by Random Forest (tree-based, no scaling needed)
FEATURE_COLUMNS = [
    "item_encoded",
    "day", "month", "month_sin", "month_cos",
    "lag_1_price", "lag_7_price", "lag_14_price", "lag_30_price",
    "moving_avg_7", "moving_avg_30", "price_std_30",
    "temperature", "rainfall", "humidity", "rainfall_7d_sum",
    "diesel_price", "diesel_price_7d_change_pct", "diesel_price_30d_ma",
    "is_festival_season",
]

# Feature columns used by LSTM (per-item model, normalized)
LSTM_FEATURE_COLUMNS = [
    "avg_price", "diesel_price",
    "temperature", "rainfall",
    "month_sin", "month_cos",
    "is_festival_season",
]
```

---

## ml-service/app/training.py

```python
from __future__ import annotations
import uuid
from datetime import datetime, timedelta
from pathlib import Path
import joblib, numpy as np, pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_percentage_error
from sklearn.preprocessing import LabelEncoder
from .preprocessing import FEATURE_COLUMNS, get_mongo_db, merge_feature_frame

MODEL_PATH = Path(__file__).resolve().parent.parent / "model" / "model.pkl"


def safe_mape(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    """MAPE computed only on non-zero actuals to avoid division by zero."""
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    mask = np.abs(y_true) > 1e-9
    if mask.sum() == 0:
        return 0.0
    return float(mean_absolute_percentage_error(y_true[mask], y_pred[mask]))


def build_reason(accuracy_pct: float, imputed_cells: int,
                 fuel_std_30: float, rain_std_30: float) -> tuple[str, str]:
    """Generate a human-readable confidence label and reason string."""
    reasons: list[str] = []
    if imputed_cells > 50:
        reasons.append("Missing data imputed for weather/fuel merge")
    if fuel_std_30 > 3:
        reasons.append("Fuel price fluctuation")
    elif fuel_std_30 < 1:
        reasons.append("Stable fuel regime")
    reasons.append("Weather variability" if rain_std_30 > 8 else "Weather consistency")
    confidence = "High" if accuracy_pct >= 85 else "Medium" if accuracy_pct >= 70 else "Low"
    return confidence, "; ".join(reasons[:3])


def recursive_horizon_forecast(model: RandomForestRegressor,
                                row_template: pd.Series,
                                hist_prices: list[float],
                                steps: int) -> list[float]:
    """
    Multi-step ahead forecast using recursive strategy:
    each predicted price is fed back as lag feature for the next step.
    Maintains a rolling window of recent predictions to update lag_1,
    lag_7, lag_14, lag_30, moving_avg_7, moving_avg_30.
    """
    preds: list[float] = []
    window = hist_prices[-60:] if len(hist_prices) > 60 else hist_prices[:]
    last_row = row_template.copy()
    for _ in range(steps):
        X = np.array([[last_row[c] for c in FEATURE_COLUMNS]])
        p = float(model.predict(X)[0])
        preds.append(max(p, 0.01))
        window.append(p)
        last_row["lag_1_price"]  = window[-2]  if len(window) >= 2  else window[-1]
        last_row["lag_7_price"]  = window[-8]  if len(window) >= 8  else window[0]
        last_row["lag_14_price"] = window[-15] if len(window) >= 15 else window[0]
        last_row["lag_30_price"] = window[-31] if len(window) >= 31 else window[0]
        last_row["moving_avg_7"]  = float(np.mean(window[-7:]))
        last_row["moving_avg_30"] = float(np.mean(window[-30:])) if len(window) >= 30 else last_row["moving_avg_7"]
        next_day = last_row["date"] + timedelta(days=1)
        last_row["date"]  = next_day
        last_row["day"]   = next_day.day
        last_row["month"] = next_day.month
    return preds


def moving_average_forecast(hist_prices: list[float], steps: int, window: int = 30) -> list[float]:
    """
    Simple rolling-mean baseline: averages last `window` days,
    projects the same value for all `steps` future days.
    Used as a comparison benchmark against Random Forest.
    """
    series = hist_prices[-window:] if len(hist_prices) >= window else hist_prices[:]
    base = float(np.mean(series))
    return [round(base, 2)] * steps


def run_training() -> dict:
    """
    Main training pipeline:
    1. Load and merge crop + weather + fuel data from MongoDB
    2. Encode item names with LabelEncoder
    3. Chronological 80/20 train-validation split
    4. Train RandomForestRegressor (200 trees, unlimited depth)
    5. Evaluate global MAPE on validation set
    6. Per-item: compute accuracy, generate 7d & 30d RF forecasts
    7. Per-item: generate 7d & 30d Moving Average baseline
    8. Write all predictions to MongoDB predictions collection
    9. Persist model to disk with joblib
    """
    merged, full, meta = merge_feature_frame()
    if len(merged) < 50:
        raise ValueError(f"Too few training rows ({len(merged)}). Need overlapping crop+weather history.")

    le = LabelEncoder()
    le.fit(full["item_name"])
    merged["item_encoded"] = le.transform(merged["item_name"])
    full["item_encoded"]   = le.transform(full["item_name"])

    merged_sorted = merged.sort_values("date").reset_index(drop=True)
    split_idx = min(max(int(len(merged_sorted) * 0.8), 1), len(merged_sorted) - 1)
    train_df = merged_sorted.iloc[:split_idx]
    val_df   = merged_sorted.iloc[split_idx:]

    X_train = train_df[FEATURE_COLUMNS].values
    y_train = train_df["target_next"].values
    X_val   = val_df[FEATURE_COLUMNS].values
    y_val   = val_df["target_next"].values

    model = RandomForestRegressor(n_estimators=200, max_depth=None, random_state=42, n_jobs=-1)
    model.fit(X_train, y_train)

    mape            = safe_mape(y_val, model.predict(X_val))
    global_accuracy = float(max(0.0, min(100.0, 100.0 * (1.0 - mape))))

    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump({"model": model, "item_encoder": le,
                 "feature_columns": FEATURE_COLUMNS,
                 "global_val_mape": mape,
                 "trained_at": datetime.utcnow().isoformat()}, MODEL_PATH)

    db = get_mongo_db()
    batch_rf7  = str(uuid.uuid4())
    batch_rf30 = str(uuid.uuid4())
    batch_ma7  = str(uuid.uuid4())
    batch_ma30 = str(uuid.uuid4())
    gen_date   = datetime.utcnow()
    docs: list[dict] = []

    for item in full["item_name"].unique():
        latest = full[full["item_name"] == item].sort_values("date")
        if latest.empty:
            continue
        last = latest.iloc[-1].copy()
        hist = latest["avg_price"].tolist()

        # Per-item validation accuracy
        ix = np.where((merged["item_name"] == item).values)[0]
        if len(ix) > 30:
            cut  = int(len(ix) * 0.8)
            Xv   = merged.iloc[ix[cut:]][FEATURE_COLUMNS].to_numpy()
            yv   = merged.iloc[ix[cut:]]["target_next"].to_numpy()
            acc_item = float(max(0.0, min(100.0, 100.0 * (1.0 - safe_mape(yv, model.predict(Xv)))))) if len(Xv) > 5 else global_accuracy
        else:
            acc_item = global_accuracy

        fuel_std = float(latest["diesel_price"].tail(30).std() or 0.0)
        rain_std = float(latest["rainfall"].tail(30).std() or 0.0)
        conf, reason = build_reason(acc_item, meta["imputed_cells"], fuel_std, rain_std)

        # Random Forest — 7-day forecast
        for i, price in enumerate(recursive_horizon_forecast(model, last.copy(), hist, 7)):
            docs.append({"date": gen_date, "target_date": gen_date + timedelta(days=i+1),
                         "item_name": item, "predicted_price": round(price, 2),
                         "horizon": "7d", "forecast_batch_id": batch_rf7,
                         "accuracy": round(acc_item, 2), "confidence": conf,
                         "reason": reason, "algorithm": "random_forest"})

        # Random Forest — 30-day forecast
        preds30 = recursive_horizon_forecast(model, last.copy(), hist, 30)
        rel     = (preds30[-1] - hist[-1]) / max(hist[-1], 1e-6)
        trend   = "Increasing" if rel > 0.02 else ("Decreasing" if rel < -0.02 else "Stable")
        for i, price in enumerate(preds30):
            doc = {"date": gen_date, "target_date": gen_date + timedelta(days=i+1),
                   "item_name": item, "predicted_price": round(price, 2),
                   "horizon": "30d", "forecast_batch_id": batch_rf30,
                   "accuracy": round(acc_item, 2), "confidence": conf,
                   "reason": reason, "algorithm": "random_forest"}
            if i == len(preds30) - 1:
                doc["trend"] = trend
            docs.append(doc)

        # Moving Average — 7-day baseline
        for i, price in enumerate(moving_average_forecast(hist, 7, window=7)):
            docs.append({"date": gen_date, "target_date": gen_date + timedelta(days=i+1),
                         "item_name": item, "predicted_price": price,
                         "horizon": "7d", "forecast_batch_id": batch_ma7,
                         "accuracy": None, "confidence": "N/A",
                         "reason": "7-day rolling average baseline", "algorithm": "moving_average"})

        # Moving Average — 30-day baseline
        for i, price in enumerate(moving_average_forecast(hist, 30, window=30)):
            docs.append({"date": gen_date, "target_date": gen_date + timedelta(days=i+1),
                         "item_name": item, "predicted_price": price,
                         "horizon": "30d", "forecast_batch_id": batch_ma30,
                         "accuracy": None, "confidence": "N/A",
                         "reason": "30-day rolling average baseline", "algorithm": "moving_average"})

    if docs:
        db["predictions"].insert_many(docs)

    return {
        "global_accuracy_pct": round(global_accuracy, 2),
        "val_mape": round(float(mape), 4),
        "predictions_written": len(docs),
        "item_count": int(len(full["item_name"].unique())),
        "batches": {"rf_7d": batch_rf7, "rf_30d": batch_rf30,
                    "ma_7d": batch_ma7, "ma_30d": batch_ma30},
    }
```

---

## ml-service/app/lstm.py

```python
from __future__ import annotations
import uuid
from datetime import datetime, timedelta
from pathlib import Path
import numpy as np
import pandas as pd
from .preprocessing import LSTM_FEATURE_COLUMNS, get_mongo_db, merge_feature_frame

LSTM_MODEL_DIR  = Path(__file__).resolve().parent.parent / "model" / "lstm"
FEATURED_KEYWORDS = ["tomato", "potato", "onion", "cauliflower", "cabbage",
                     "chamal", "wheat", "ginger", "garlic", "chilli"]
SEQUENCE_LEN = 30   # days of history per input window
EPOCHS       = 40
BATCH_SIZE   = 32


def is_featured(item_name: str) -> bool:
    return any(kw in item_name.lower() for kw in FEATURED_KEYWORDS)


def build_sequences(prices: np.ndarray, features: np.ndarray, seq_len: int):
    """
    Sliding-window sequence builder.
    Each sample X[i] is a (seq_len × n_features) window;
    y[i] is the price at position i (the next day after the window).
    """
    X, y = [], []
    for i in range(seq_len, len(prices)):
        X.append(features[i - seq_len : i])
        y.append(prices[i])
    return np.array(X), np.array(y)


def run_lstm_training() -> dict:
    """
    LSTM training pipeline (per featured crop):
    1. Load merged feature frame from MongoDB
    2. Min-max normalize features and prices per item
    3. Build 30-day sliding window sequences
    4. Train 2-layer LSTM: LSTM(64) → Dropout → LSTM(32) → Dropout → Dense(1)
    5. Recursive 30-step forecast: feed each prediction back as next input
    6. Denormalize predictions and write to MongoDB
    """
    try:
        import tensorflow as tf
        from tensorflow import keras
    except ImportError:
        raise RuntimeError("TensorFlow not installed. Run: pip install tensorflow-cpu")

    tf.get_logger().setLevel("ERROR")
    _, full, _ = merge_feature_frame()
    if full.empty:
        raise ValueError("No data available for LSTM training.")

    items = [i for i in full["item_name"].unique() if is_featured(i)]
    if not items:
        items = full["item_name"].unique().tolist()[:10]

    db       = get_mongo_db()
    batch_7  = str(uuid.uuid4())
    batch_30 = str(uuid.uuid4())
    gen_date = datetime.utcnow()
    LSTM_MODEL_DIR.mkdir(parents=True, exist_ok=True)

    docs: list[dict] = []
    trained = 0

    for item in items:
        item_df = full[full["item_name"] == item].sort_values("date").reset_index(drop=True)
        if len(item_df) < SEQUENCE_LEN + 20:
            continue

        feat_cols = [c for c in LSTM_FEATURE_COLUMNS if c in item_df.columns]
        feat_data  = item_df[feat_cols].values.astype(float)
        price_data = item_df["avg_price"].values.astype(float)

        # Min-max normalization (per feature, per item)
        feat_min   = feat_data.min(axis=0)
        feat_max   = feat_data.max(axis=0)
        feat_range = np.where(feat_max - feat_min < 1e-9, 1.0, feat_max - feat_min)
        feat_norm  = (feat_data - feat_min) / feat_range

        price_min   = price_data.min()
        price_max   = price_data.max()
        price_range = max(price_max - price_min, 1e-9)
        price_norm  = (price_data - price_min) / price_range

        X, y = build_sequences(price_norm, feat_norm, SEQUENCE_LEN)
        if len(X) < 20:
            continue

        split   = int(len(X) * 0.85)
        X_train, X_val = X[:split], X[split:]
        y_train, y_val = y[:split], y[split:]

        # Model architecture: 2-layer stacked LSTM with dropout regularization
        model = keras.Sequential([
            keras.layers.LSTM(64, return_sequences=True, input_shape=(SEQUENCE_LEN, len(feat_cols))),
            keras.layers.Dropout(0.2),
            keras.layers.LSTM(32),
            keras.layers.Dropout(0.1),
            keras.layers.Dense(1),
        ])
        model.compile(optimizer="adam", loss="mae")
        model.fit(
            X_train, y_train,
            validation_data=(X_val, y_val),
            epochs=EPOCHS,
            batch_size=BATCH_SIZE,
            callbacks=[keras.callbacks.EarlyStopping(patience=6, restore_best_weights=True)],
            verbose=0,
        )

        model_file = LSTM_MODEL_DIR / f"{item.replace(' ', '_').replace('/', '_')}.keras"
        model.save(str(model_file))

        # Recursive 30-step forecast from last known sequence
        last_seq          = feat_norm[-SEQUENCE_LEN:].copy()
        price_feat_idx    = feat_cols.index("avg_price") if "avg_price" in feat_cols else 0
        forecast_prices: list[float] = []

        for _ in range(30):
            inp        = last_seq[-SEQUENCE_LEN:][np.newaxis]      # shape: (1, 30, n_feat)
            pred_norm  = float(model.predict(inp, verbose=0)[0][0])
            pred_price = pred_norm * price_range + price_min       # denormalize
            forecast_prices.append(max(pred_price, 0.0))
            new_row                   = last_seq[-1].copy()
            new_row[price_feat_idx]   = pred_norm                  # feed prediction back
            last_seq                  = np.vstack([last_seq, new_row])

        current_p = price_data[-1]
        rel       = (forecast_prices[-1] - current_p) / max(current_p, 1e-6)
        trend     = "Increasing" if rel > 0.02 else ("Decreasing" if rel < -0.02 else "Stable")

        for i, price in enumerate(forecast_prices[:7]):
            docs.append({"date": gen_date, "target_date": gen_date + timedelta(days=i+1),
                         "item_name": item, "predicted_price": round(price, 2),
                         "horizon": "7d", "forecast_batch_id": batch_7,
                         "algorithm": "lstm", "confidence": "Medium",
                         "reason": "LSTM: learns diesel price shock propagation + seasonal patterns"})

        for i, price in enumerate(forecast_prices[:30]):
            doc = {"date": gen_date, "target_date": gen_date + timedelta(days=i+1),
                   "item_name": item, "predicted_price": round(price, 2),
                   "horizon": "30d", "forecast_batch_id": batch_30,
                   "algorithm": "lstm", "confidence": "Medium",
                   "reason": "LSTM: learns diesel price shock propagation + seasonal patterns"}
            if i == len(forecast_prices[:30]) - 1:
                doc["trend"] = trend
            docs.append(doc)

        trained += 1

    if docs:
        db["predictions"].insert_many(docs)

    return {"items_trained": trained, "predictions_written": len(docs),
            "batches": {"lstm_7d": batch_7, "lstm_30d": batch_30}}
```

---

*End of Algorithm Source Code*
