@echo off
REM Solar Analysis Tool - Server Start Script
REM Starts both React dev server and Python FastAPI server

echo ========================================
echo Solar Analysis Tool - Starting Servers
echo ========================================

REM Start Python server (FastAPI on port 8000)
echo [1/2] Starting Python server... (port 8000)
start "Python Server" cmd /k "cd BackEnd && python Main.py"

REM Start React dev server (Vite on port 5173)
echo [2/2] Starting React server... (port 5173)
start "React Server" cmd /k "npm run dev"

echo.
echo ========================================
echo All servers started.
echo - React:  http://localhost:5173
echo - Python: http://localhost:8000
echo ========================================
echo.
echo To stop servers, run stop.bat
pause
