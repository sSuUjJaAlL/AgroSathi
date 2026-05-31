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


def safe_mape(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
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


def recursive_horizon_forecast(
    model: RandomForestRegressor,
    row_template: pd.Series,
    hist_prices: list[float],
    steps: int,
) -> list[float]:
    preds: list[float] = []
    window = hist_prices[-60:] if len(hist_prices) > 60 else hist_prices[:]
    last_row = row_template.copy()

    for _ in range(steps):
        X = np.array([[last_row[c] for c in FEATURE_COLUMNS]])
        p = float(model.predict(X)[0])
        preds.append(max(p, 0.01))
        window.append(p)
        lag_1 = window[-2] if len(window) >= 2 else window[-1]
        lag_7 = window[-8] if len(window) >= 8 else window[0]
        lag_14 = window[-15] if len(window) >= 15 else window[0]
        lag_30 = window[-31] if len(window) >= 31 else window[0]
        ma7 = float(np.mean(window[-7:]))
        ma30 = float(np.mean(window[-30:])) if len(window) >= 30 else ma7

        last_row["lag_1_price"] = lag_1
        last_row["lag_7_price"] = lag_7
        last_row["lag_14_price"] = lag_14
        last_row["lag_30_price"] = lag_30
        last_row["moving_avg_7"] = ma7
        last_row["moving_avg_30"] = ma30

        next_day = last_row["date"] + timedelta(days=1)
        last_row["date"] = next_day
        last_row["day"] = next_day.day
        last_row["month"] = next_day.month

    return preds


def moving_average_forecast(hist_prices: list[float], steps: int, window: int = 30) -> list[float]:
    """Simple rolling-average baseline forecast."""
    series = hist_prices[-window:] if len(hist_prices) >= window else hist_prices[:]
    base = float(np.mean(series))
    return [round(base, 2)] * steps


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
    split_idx = int(len(merged_sorted) * 0.8)
    split_idx = min(max(split_idx, 1), len(merged_sorted) - 1)
    train_df = merged_sorted.iloc[:split_idx]
    val_df = merged_sorted.iloc[split_idx:]

    if len(train_df) < 10 or len(val_df) < 5:
        raise ValueError(
            f"Train/validation split too small (train={len(train_df)}, val={len(val_df)}). Need more dated price history."
        )

    X_train = train_df[FEATURE_COLUMNS].values
    y_train = train_df["target_next"].values
    X_val = val_df[FEATURE_COLUMNS].values
    y_val = val_df["target_next"].values

    # sklearn Pipeline (algorithm 3): imputer fit on X_train only → no val data leakage
    model = Pipeline([
        ("imputer", SimpleImputer(strategy="median")),
        ("rf", RandomForestRegressor(n_estimators=200, max_depth=None, random_state=42, n_jobs=-1)),
    ])
    model.fit(X_train, y_train)
    y_hat = model.predict(X_val)
    mape = safe_mape(y_val, y_hat)
    global_accuracy = float(max(0.0, min(100.0, 100.0 * (1.0 - mape))))

    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(
        {
            "model": model,
            "item_encoder": le,
            "feature_columns": FEATURE_COLUMNS,
            "global_val_mape": mape,
            "trained_at": datetime.utcnow().isoformat(),
        },
        MODEL_PATH,
    )

    db = get_mongo_db()
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

        item_mask_val = merged["item_name"] == item
        if item_mask_val.sum() > 30:
            ix = np.where(item_mask_val.values)[0]
            cut = int(len(ix) * 0.8)
            val_ix = ix[cut:]
            if len(val_ix) > 5:
                Xv = merged.iloc[val_ix][FEATURE_COLUMNS].to_numpy()
                yv = merged.iloc[val_ix]["target_next"].to_numpy()
                ypv = model.predict(Xv)
                mape_item = safe_mape(np.asarray(yv, dtype=float), np.asarray(ypv, dtype=float))
                acc_item = float(max(0.0, min(100.0, 100.0 * (1.0 - mape_item))))
            else:
                acc_item = global_accuracy
        else:
            acc_item = global_accuracy

        conf, reason = build_reason(acc_item, meta["imputed_cells"], fuel_std, rain_std)

        # --- RandomForest predictions ---
        preds7 = recursive_horizon_forecast(model, last, hist, 7)
        for i, price in enumerate(preds7):
            target = gen_date + timedelta(days=i + 1)
            docs.append({
                "date": gen_date,
                "target_date": target,
                "item_name": item,
                "predicted_price": round(price, 2),
                "horizon": "7d",
                "forecast_batch_id": batch_rf7,
                "accuracy": round(acc_item, 2),
                "confidence": conf,
                "reason": reason,
                "algorithm": "random_forest",
            })

        preds30 = recursive_horizon_forecast(model, last, hist, 30)
        current_p = float(hist[-1])
        future_p = preds30[-1]
        rel = (future_p - current_p) / max(current_p, 1e-6)
        trend = "Increasing" if rel > 0.02 else ("Decreasing" if rel < -0.02 else "Stable")

        for i, price in enumerate(preds30):
            target = gen_date + timedelta(days=i + 1)
            doc = {
                "date": gen_date,
                "target_date": target,
                "item_name": item,
                "predicted_price": round(price, 2),
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
        "global_accuracy_pct": round(global_accuracy, 2),
        "val_mape": round(float(mape), 4),
        "predictions_written": len(docs),
        "item_count": int(len(items)),
        "batches": {
            "rf_7d": batch_rf7,
            "rf_30d": batch_rf30,
        },
    }
