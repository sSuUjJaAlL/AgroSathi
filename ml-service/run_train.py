import os
from dotenv import load_dotenv
load_dotenv()

from app.training import run_training

print("[Train] Starting force retrain...")
result = run_training(force=True)
print("[Train] Done:", result)
