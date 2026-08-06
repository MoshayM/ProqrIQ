@echo off

REM ── If called with "restart_server", enter auto-restart loop ──
if "%1"=="restart_server" goto RESTART_LOOP

title ProqrIQ Launcher
cd /d "D:\project\AutoQuote"

echo ============================================
echo   ProqrIQ - Manufacturing Cost Estimator
echo ============================================
echo.

REM Check if Node.js is available
where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js not found. Please install Node.js from https://nodejs.org
  pause
  exit /b 1
)

REM Check if dependencies are installed
if not exist "node_modules" (
  echo Installing dependencies...
  call npm install --legacy-peer-deps
  if errorlevel 1 (
    echo ERROR: Failed to install dependencies.
    pause
    exit /b 1
  )
)

REM Check if database exists; if not, push schema and seed
if not exist "data\autoquote.db" (
  echo Setting up database...
  call npm run db:push
  if errorlevel 1 (
    echo ERROR: Failed to create database schema.
    pause
    exit /b 1
  )
  call npm run db:seed
  if errorlevel 1 (
    echo ERROR: Failed to seed database.
    pause
    exit /b 1
  )
  echo Database ready.
)

echo.
echo Starting ProqrIQ Server on http://localhost:3099 (auto-restart enabled)...
start "ProqrIQ Server" cmd /k ""%~f0" restart_server"

echo Waiting for server to start...
timeout /t 4 /nobreak >nul

echo Starting ProqrIQ Client on http://localhost:5299 ...
start "ProqrIQ Client" cmd /k "cd /d D:\project\AutoQuote && npm run dev:client"

echo Waiting for client to compile...
timeout /t 6 /nobreak >nul

echo Opening browser...
start http://localhost:5299

echo.
echo ============================================
echo   ProqrIQ is running!
echo   URL:    http://localhost:5299
echo   Server: http://localhost:3099
echo.
echo   Default login credentials:
echo     admin@autoquote.com    / AutoQuote2024!
echo     engineer@autoquote.com / AutoQuote2024!
echo     analyst@autoquote.com  / AutoQuote2024!
echo     ceo@autoquote.com      / AutoQuote2024!
echo.
echo   Close the Server and Client windows to stop.
echo ============================================
echo.
goto :EOF

REM ── Auto-restart loop (entered when called as: AutoQuote.bat restart_server) ──
:RESTART_LOOP
title ProqrIQ Server (auto-restart)
cd /d "D:\project\AutoQuote"
:LOOP
echo.
echo [%TIME%] Starting ProqrIQ Server...
echo.
npm run dev:server
echo.
echo [%TIME%] Server stopped or crashed. Restarting in 3 seconds...
echo   (Close this window to stop)
echo.
timeout /t 3 /nobreak >nul
goto LOOP
