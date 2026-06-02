@echo off
echo Starting AgroPredict Nepal...

echo [1/3] Starting ML Service...
start "ML Service" cmd /k "cd /d %~dp0ml-service && .venv\Scripts\uvicorn.exe app.main:app --host 0.0.0.0 --port 8000"

timeout /t 3 /nobreak >nul

echo [2/3] Starting Backend...
start "Backend" cmd /k "cd /d %~dp0backend && node_modules\.bin\tsx.cmd src\app.ts"

timeout /t 4 /nobreak >nul

echo [3/3] Starting Frontend...
start "Frontend" cmd /k "cd /d %~dp0frontend && node_modules\.bin\vite.cmd --port 5173"

timeout /t 3 /nobreak >nul

echo.
echo All services started!
echo Open your browser: http://localhost:5173
echo.
start http://localhost:5173


