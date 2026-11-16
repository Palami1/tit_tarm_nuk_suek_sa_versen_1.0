@echo off
setlocal EnableExtensions
title LTC Intern Tracking System (HTTPS Mode)

cd /d "%~dp0"

echo ========================================================
echo   Starting LTC Intern System in Secure HTTPS Mode...
echo ========================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not installed!
    pause
    exit /b
)

if not exist "certificates\cert.pem" (
    echo [INFO] Generating SSL certificate for local and VPN IPs...
    python scripts/generate-cert.py
    echo.
)

start /b cmd /c "timeout /t 4 /nobreak >nul & start https://localhost:3000"

echo [OK] Next.js server starting with HTTPS on port 3000...
echo [OK] Browser will automatically open https://localhost:3000
echo.
echo [NOTE] In browser, click "Advanced" -> "Proceed to site (unsafe)"
echo.
echo ========================================================
echo   Server is running! To stop, press Ctrl+C
echo ========================================================
echo.

call npm run dev:https

pause
