from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

from .preprocessing import LSTM_FEATURE_COLUMNS, SELECTED_CROPS, get_mongo_db, merge_feature_frame

LSTM_MODEL_DIR = Path(__file__).resolve().parent.parent / "model" / "lstm"

SEQUENCE_LEN = 30  # days of history fed to LSTM
EPOCHS = 40
BATCH_SIZE = 32


def is_selected(item_name: str) -> bool:
    return item_name in SELECTED_CROPS


def build_sequences(prices: np.ndarray, features: np.ndarray, seq_len: int):
    X, y = [], []
    for i in range(seq_len, len(prices)):
        X.append(features[i - seq_len : i])
        y.append(prices[i])
    return np.array(X), np.array(y)


def run_lstm_training() -> dict:
    try:
        import tensorflow as tf
        from tensorflow import keras
    except ImportError:
        raise RuntimeError("TensorFlow not installed. Run: pip install tensorflow-cpu")

    tf.get_logger().setLevel("ERROR")

    _, full, meta = merge_feature_frame()
    if full.empty:
        raise ValueError("No data for LSTM training.")

    items = [i for i in full["item_name"].unique() if is_selected(i)]
    if not items:
        items = [i for i in SELECTED_CROPS if i in full["item_name"].unique().tolist()]

    db = get_mongo_db()
    db["predictions"].delete_many({"algorithm": "lstm"})
    batch_7 = str(uuid.uuid4())
    batch_30 = str(uuid.uuid4())
    gen_date = datetime.utcnow()

    LSTM_MODEL_DIR.mkdir(parents=True, exist_ok=True)
    docs: list[dict] = []
    trained = 0

    for item in items:
        item_df = full[full["item_name"] == item].sort_values("date").reset_index(drop=True)
        if len(item_df) < SEQUENCE_LEN + 20:
            print(f"[LSTM] Skipping {item}: too few rows ({len(item_df)})")
            continue

        # Normalize features
        feat_cols = [c for c in LSTM_FEATURE_COLUMNS if c in item_df.columns]
        feat_data = item_df[feat_cols].values.astype(float)
        price_data = item_df["avg_price"].values.astype(float)

        # Min-max scale per feature
        feat_min = feat_data.min(axis=0)
        feat_max = feat_data.max(axis=0)
        feat_range = np.where(feat_max - feat_min < 1e-9, 1.0, feat_max - feat_min)
        feat_norm = (feat_data - feat_min) / feat_range

        price_min = price_data.min()
        price_max = price_data.max()
        price_range = max(price_max - price_min, 1e-9)
        price_norm = (price_data - price_min) / price_range

        X, y = build_sequences(price_norm, feat_norm, SEQUENCE_LEN)
        if len(X) < 20:
            continue

        split = int(len(X) * 0.85)
        X_train, X_val = X[:split], X[split:]
        y_train, y_val = y[:split], y[split:]

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

        # Generate forecasts: use last SEQUENCE_LEN rows as seed, predict recursively
        last_seq = feat_norm[-SEQUENCE_LEN:].copy()
        last_price_norm = price_norm[-1]
        forecast_prices_raw: list[float] = []

        for step in range(30):
            inp = last_seq[-SEQUENCE_LEN:][np.newaxis]  # (1, seq_len, n_feat)
            pred_norm = float(model.predict(inp, verbose=0)[0][0])
            pred_price = pred_norm * price_range + price_min
            forecast_prices_raw.append(max(pred_price, 0.0))

            # Update sequence: roll forward with new prediction as avg_price feature
            new_row = last_seq[-1].copy()
            price_feat_idx = feat_cols.index("avg_price") if "avg_price" in feat_cols else 0
            new_row[price_feat_idx] = pred_norm
            last_seq = np.vstack([last_seq, new_row])

        preds7 = forecast_prices_raw[:7]
        preds30 = forecast_prices_raw[:30]

        current_p = price_data[-1]
        future_p30 = preds30[-1] if preds30 else current_p
        rel = (future_p30 - current_p) / max(current_p, 1e-6)
        trend = "Increasing" if rel > 0.02 else ("Decreasing" if rel < -0.02 else "Stable")

        for i, price in enumerate(preds7):
            target = gen_date + timedelta(days=i + 1)
            docs.append({
                "date": gen_date,
                "target_date": target,
                "item_name": item,
                "predicted_price": round(price, 2),
                "horizon": "7d",
                "forecast_batch_id": batch_7,
                "algorithm": "lstm",
                "confidence": "Medium",
                "reason": "LSTM sequential model: learns diesel price shock propagation + seasonal patterns",
            })

        for i, price in enumerate(preds30):
            target = gen_date + timedelta(days=i + 1)
            doc = {
                "date": gen_date,
                "target_date": target,
                "item_name": item,
                "predicted_price": round(price, 2),
                "horizon": "30d",
                "forecast_batch_id": batch_30,
                "algorithm": "lstm",
                "confidence": "Medium",
                "reason": "LSTM sequential model: learns diesel price shock propagation + seasonal patterns",
            }
            if i == len(preds30) - 1:
                doc["trend"] = trend
            docs.append(doc)

        trained += 1
        print(f"[LSTM] Trained {item}: {len(docs)} docs so far")

    if docs:
        db["predictions"].insert_many(docs)

    return {
        "items_trained": trained,
        "predictions_written": len(docs),
        "batches": {"lstm_7d": batch_7, "lstm_30d": batch_30},
    }
