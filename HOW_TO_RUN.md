# AgroPredict Nepal — How to Run

## What You Need Installed

| Tool | Minimum Version | Download |
|------|----------------|---------|
| Node.js | 18+ | https://nodejs.org |
| Python | 3.10+ | https://python.org |

No Docker needed — the database is hosted on MongoDB Atlas (cloud).

---

## Quickest Way — Double-Click to Start

Double-click **`start.bat`** in the project folder.

This opens 3 terminal windows and your browser automatically:

- ML Service → http://localhost:8000
- Backend API → http://localhost:4000
- Frontend → http://localhost:5173

Wait about 15 seconds for all three to finish loading, then the browser will open.

---

## Manual Start (3 Terminals)

If `start.bat` does not work, open 3 separate terminal windows and run one command in each.

### Terminal 1 — ML Service

```
cd ml-service
.venv\Scripts\uvicorn.exe app.main:app --host 0.0.0.0 --port 8000
```

Wait until you see:
```
Application startup complete.
```

### Terminal 2 — Backend

```
cd backend
node_modules\.bin\tsx.cmd src\app.ts
```

Wait until you see:
```
Backend listening on http://localhost:4000
[MongoDB] Connected to Atlas.
```

### Terminal 3 — Frontend

```
cd frontend
node_modules\.bin\vite.cmd --port 5173
```

Wait until you see:
```
Local: http://localhost:5173
```

Then open **http://localhost:5173** in your browser.

---

## First-Time Setup (do this ONCE before first run)

### 1. Install dependencies

Open a terminal in the project folder and run:

```
cd backend && npm install
cd ..\frontend && npm install
```

### 2. Set up the Python virtual environment

```
cd ml-service
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Create environment files

**`backend/.env`** — create this file with:

```
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.l8ccl.mongodb.net/agri_price_nepal
JWT_SECRET=change-this-to-a-random-string
ML_SERVICE_URL=http://localhost:8000
SMTP_USER=your-gmail@gmail.com
SMTP_PASS=your-gmail-app-password
```

**`ml-service/.env`** — create this file with:

```
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.l8ccl.mongodb.net/agri_price_nepal
```

> Get the Atlas connection string from the project owner.

---

## Run the ML Pipeline (First Time Only)

After all services are running, log in and click **"Run Pipeline"** on the dashboard.

This will:
1. Scrape today's Kalimati Market prices
2. Sync weather data
3. Train the ML model (takes 1–2 minutes)
4. Generate 7-day and 30-day price forecasts

After the first run, the pipeline runs automatically every day at **6:05 AM**.

---

## Stopping the App

- Press `Ctrl + C` in each of the 3 terminal windows

---

## Summary Table

| Terminal | Folder | Command |
|----------|--------|---------|
| 1 | `ml-service` | `.venv\Scripts\uvicorn.exe app.main:app --host 0.0.0.0 --port 8000` |
| 2 | `backend` | `node_modules\.bin\tsx.cmd src\app.ts` |
| 3 | `frontend` | `node_modules\.bin\vite.cmd --port 5173` |

Or just double-click **`start.bat`**.

---

## Common Problems

**"ML Service not starting"**
→ Run `cd ml-service && .venv\Scripts\activate && pip install -r requirements.txt` and try again.

**"Backend not connecting to Atlas"**
→ Check `backend/.env` has the correct `MONGODB_URI`. Make sure you have internet access.

**"No commodities / empty dashboard"**
→ The database is already seeded on Atlas — if it's empty, contact the project owner to verify Atlas access.

**"Port already in use"**
→ Something is already running on port 8000, 4000, or 5173. Close the old terminal or restart your computer.

**"Forecasts missing"**
→ Click "Run Pipeline" on the dashboard and wait 1–2 minutes.
