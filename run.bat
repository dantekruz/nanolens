@echo off
REM ============================================================
REM run.bat  Start NanoLens (Backend + Frontend) on Windows
REM ============================================================
SET ROOT=%~dp0

echo.
echo ==========================================
echo    NanoLens -- Startup Script
echo ==========================================
echo.

echo [1/3] Checking Python dependencies...
pip install -r "%ROOT%requirements.txt" --quiet --exists-action i
if errorlevel 1 ( echo ERROR: pip install failed. & pause & exit /b 1 )
echo     Done.

echo [2/3] Starting FastAPI backend (http://localhost:8000)...
start "NanoLens Backend" /D "%ROOT%" cmd /c "python backend.py & pause"
timeout /t 3 /nobreak >nul

echo [3/3] Starting React frontend (http://localhost:3000)...
cd /d "%ROOT%nanolens"
if not exist "node_modules" (
    echo Installing npm packages - first run takes ~1 minute...
    call npm install
    if errorlevel 1 ( echo ERROR: npm install failed. & pause & exit /b 1 )
)
start "NanoLens Frontend" /D "%ROOT%nanolens" cmd /c "npm start & pause"

echo.
echo  Backend:   http://localhost:8000
echo  Frontend:  http://localhost:3000
echo  Close the two popup windows to stop servers.
echo.
pause
