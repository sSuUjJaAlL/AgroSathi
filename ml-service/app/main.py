from __future__ import annotations

import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

load_dotenv()

from .training import run_training
from .lstm import run_lstm_training

app = FastAPI(title="Agri Price ML Service", version="2.0.0")


@app.get("/health")
def health():
    return {"status": "ok", "service": "agri-price-ml", "version": "2.0.0"}


class TrainRequest(BaseModel):
    force: bool = False


@app.post("/train")
def train(body: TrainRequest = TrainRequest()):
    """Train RandomForest for all crops. force=True bypasses preprocessing cache."""
    try:
        result = run_training(force=body.force)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/train-lstm")
def train_lstm():
    """Train LSTM for the 10 featured crops. Takes 5–15 minutes. Writes lstm-tagged predictions."""
    try:
        result = run_lstm_training()
        return result
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


def main():
    import uvicorn

    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=False)


if __name__ == "__main__":
    main()
