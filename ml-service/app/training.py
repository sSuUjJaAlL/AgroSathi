from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.metrics import mean_absolute_percentage_error
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import LabelEncoder

from .preprocessing import FEATURE_COLUMNS, get_mongo_db, merge_feature_frame

MODEL_PATH = Path(__file__).resolve().parent.parent / "model" / "model.pkl"

HORIZONS_7D = list(range(1, 8))    # t+1 through t+7
HORIZONS_30D = list(range(1, 31))  # t+1 through t+30


def safe_mape(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    y_true = np.asarray(y_true, dtype=float).ravel()
    y_pred = np.asarray(y_pred, dtype=float).ravel()
    mask = np.abs(y_true) > 1e-9
    if mask.sum() == 0:
        return 0.0
    return float(mean_absolute_percentage_error(y_true[mask], y_pred[mask]))


def build_reason(
    accuracy_pct: float,
    imputed_cells: int,
    fuel_std_30: float,
    rain_std_30: float,
) -> tuple[str, str]:
    reasons: list[str] = []
    if imputed_cells > 50:
        reasons.append("Missing data imputed for weather/fuel merge")
    if fuel_std_30 > 3:
        reasons.append("Fuel price fluctuation")
    elif fuel_std_30 < 1:
        reasons.append("Stable fuel regime")
    if rain_std_30 > 8:
        reasons.append("Weather variability")
    else:
        reasons.append("Weather consistency")
    if not reasons:
        reasons.append("Stable historical trend")
    confidence = "High" if accuracy_pct >= 85 else "Medium" if accuracy_pct >= 70 else "Low"
    return confidence, "; ".join(reasons[:3])


def moving_average_forecast(hist_prices: list[float], steps: int, window: int = 30) -> list[float]:
    """Simple rolling-average baseline forecast."""
    series = hist_prices[-window:] if len(hist_prices) >= window else hist_prices[:]
    base = float(np.mean(series))
    return [round(base, 2)] * steps


def _make_pipeline() -> Pipeline:
    return Pipeline([
        ("imputer", SimpleImputer(strategy="median")),
        ("rf", RandomForestRegressor(
            n_estimators=300,
            max_depth=12,
            min_samples_leaf=4,
            random_state=42,
            n_jobs=-1,
        )),
    ])


def run_training(force: bool = False) -> dict:
    merged, full, meta = merge_feature_frame(force=force)
    if not merged.empty and "date" in merged.columns:
        min_date = merged["date"].min()
        max_date = merged["date"].max()
        print(f"[ML] Training on {len(merged)} rows from {min_date.date()} to {max_date.date()}")
    if len(merged) < 50:
        raise ValueError(
            f"Too few training rows after preprocessing ({len(merged)}). Need more overlapping crop + weather history."
        )

    le = LabelEncoder()
    le.fit(full["item_name"])
    merged = merged.copy()
    merged["item_encoded"] = le.transform(merged["item_name"])
    full = full.copy()
    full["item_encoded"] = le.transform(full["item_name"])

    merged_sorted = merged.sort_values("date").reset_index(drop=True)

    target_cols_7d = [f"target_{h}d" for h in HORIZONS_7D]
    target_cols_30d = [f"target_{h}d" for h in HORIZONS_30D]

    missing = [c for c in target_cols_30d if c not in merged_sorted.columns]
    if missing:
        raise ValueError(
            f"Multi-step target columns missing: {missing}. Run with force=True to rebuild the preprocessing cache."
        )

    # Separate chronological splits per horizon (30d needs more rows to have targets)
    df_7d = merged_sorted.dropna(subset=target_cols_7d).reset_index(drop=True)
    df_30d = merged_sorted.dropna(subset=target_cols_30d).reset_index(drop=True)

    split_7d = max(1, min(int(len(df_7d) * 0.8), len(df_7d) - 1))
    split_30d = max(1, min(int(len(df_30d) * 0.8), len(df_30d) - 1))

    train_7d, val_7d = df_7d.iloc[:split_7d], df_7d.iloc[split_7d:]
    train_30d, val_30d = df_30d.iloc[:split_30d], df_30d.iloc[split_30d:]

    if len(train_7d) < 10 or len(val_7d) < 5:
        raise ValueError(f"7d split too small (train={len(train_7d)}, val={len(val_7d)}).")
    if len(train_30d) < 10 or len(val_30d) < 5:
        raise ValueError(f"30d split too small (train={len(train_30d)}, val={len(val_30d)}).")

    X_train_7d = train_7d[FEATURE_COLUMNS].values
    Y_train_7d = train_7d[target_cols_7d].values
    X_val_7d = val_7d[FEATURE_COLUMNS].values
    Y_val_7d = val_7d[target_cols_7d].values

    X_train_30d = train_30d[FEATURE_COLUMNS].values
    Y_train_30d = train_30d[target_cols_30d].values
    X_val_30d = val_30d[FEATURE_COLUMNS].values
    Y_val_30d = val_30d[target_cols_30d].values

    # Direct multi-output models — one predict call per item, no recursive compounding
    print("[ML] Training 7d direct model...")
    model_7d = _make_pipeline()
    model_7d.fit(X_train_7d, Y_train_7d)
    Y_hat_7d = model_7d.predict(X_val_7d)
    mape_7d = safe_mape(Y_val_7d, Y_hat_7d)
    accuracy_7d = float(max(0.0, min(100.0, 100.0 * (1.0 - mape_7d))))
    print(f"[ML] 7d accuracy: {accuracy_7d:.1f}% (MAPE {mape_7d:.4f})")

    print("[ML] Training 30d direct model...")
    model_30d = _make_pipeline()
    model_30d.fit(X_train_30d, Y_train_30d)
    Y_hat_30d = model_30d.predict(X_val_30d)
    mape_30d = safe_mape(Y_val_30d, Y_hat_30d)
    accuracy_30d = float(max(0.0, min(100.0, 100.0 * (1.0 - mape_30d))))
    print(f"[ML] 30d accuracy: {accuracy_30d:.1f}% (MAPE {mape_30d:.4f})")

    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(
        {
            "model": model_7d,        # "model" key kept for any legacy consumers
            "model_7d": model_7d,
            "model_30d": model_30d,
            "item_encoder": le,
            "feature_columns": FEATURE_COLUMNS,
            "global_val_mape_7d": mape_7d,
            "global_val_mape_30d": mape_30d,
            "trained_at": datetime.utcnow().isoformat(),
        },
        MODEL_PATH,
    )

    db = get_mongo_db()

    # Clear stale RF predictions before writing fresh batch
    db["predictions"].delete_many({"algorithm": "random_forest"})

    batch_rf7 = str(uuid.uuid4())
    batch_rf30 = str(uuid.uuid4())
    gen_date = datetime.utcnow()

    items = full["item_name"].unique()
    docs: list[dict] = []

    for item in items:
        latest = full[full["item_name"] == item].sort_values("date")
        if latest.empty:
            continue

        last = latest.iloc[-1].copy()
        hist = latest["avg_price"].tolist()

        fuel_tail = latest["diesel_price"].tail(30)
        rain_tail = latest["rainfall"].tail(30)
        fuel_std = float(fuel_tail.std() or 0.0)
        rain_std = float(rain_tail.std() or 0.0)

        # Per-item accuracy from 7d model validation slice
        item_mask = df_7d["item_name"] == item
        if item_mask.sum() > 30:
            ix = np.where(item_mask.values)[0]
            cut = int(len(ix) * 0.8)
            val_ix = ix[cut:]
            if len(val_ix) > 5:
                Xv = df_7d.iloc[val_ix][FEATURE_COLUMNS].to_numpy()
                Yv = df_7d.iloc[val_ix][target_cols_7d].to_numpy()
                Ypv = model_7d.predict(Xv)
                mape_item = safe_mape(Yv, Ypv)
                acc_item = float(max(0.0, min(100.0, 100.0 * (1.0 - mape_item))))
            else:
                acc_item = accuracy_7d
        else:
            acc_item = accuracy_7d

        conf, reason = build_reason(acc_item, meta["imputed_cells"], fuel_std, rain_std)

        # Single predict call — direct forecast, no recursive error compounding
        X_last = np.array([[last[c] for c in FEATURE_COLUMNS]])
        preds7: np.ndarray = model_7d.predict(X_last)[0]   # shape (7,)
        preds30: np.ndarray = model_30d.predict(X_last)[0]  # shape (30,)

        for i, price in enumerate(preds7):
            docs.append({
                "date": gen_date,
                "target_date": gen_date + timedelta(days=i + 1),
                "item_name": item,
                "predicted_price": round(max(float(price), 0.01), 2),
                "horizon": "7d",
                "forecast_batch_id": batch_rf7,
                "accuracy": round(acc_item, 2),
                "confidence": conf,
                "reason": reason,
                "algorithm": "random_forest",
            })

        current_p = float(hist[-1])
        future_p = float(preds30[-1])
        rel = (future_p - current_p) / max(current_p, 1e-6)
        trend = "Increasing" if rel > 0.02 else ("Decreasing" if rel < -0.02 else "Stable")

        for i, price in enumerate(preds30):
            doc = {
                "date": gen_date,
                "target_date": gen_date + timedelta(days=i + 1),
                "item_name": item,
                "predicted_price": round(max(float(price), 0.01), 2),
                "horizon": "30d",
                "forecast_batch_id": batch_rf30,
                "accuracy": round(acc_item, 2),
                "confidence": conf,
                "reason": reason,
                "algorithm": "random_forest",
            }
            if i == len(preds30) - 1:
                doc["trend"] = trend
            docs.append(doc)

    if docs:
        db["predictions"].insert_many(docs)

    return {
        "model_path": str(MODEL_PATH),
        "accuracy_7d_pct": round(accuracy_7d, 2),
        "accuracy_30d_pct": round(accuracy_30d, 2),
        "val_mape_7d": round(float(mape_7d), 4),
        "val_mape_30d": round(float(mape_30d), 4),
        "predictions_written": len(docs),
        "item_count": int(len(items)),
        "batches": {
            "rf_7d": batch_rf7,
            "rf_30d": batch_rf30,
        },
    }
