@echo off
setlocal EnableExtensions
title LTC Intern Tracking System

REM Find and navigate to intern-system directory
cd /d "%~dp0"

if exist "%~dp0intern-system\package.json" (
    cd /d "%~dp0intern-system"
    goto :found
)

if exist "%~dp0package.json" (
    cd /d "%~dp0"
    goto :found
)

for /d %%i in ("%~dp0*") do (
    if exist "%%~fi\intern-system\package.json" (
        cd /d "%%~fi\intern-system"
        goto :found
    )
)

echo.
echo [ERROR] Could not find intern-system folder!
echo Please make sure the project folder is on Desktop.
echo.
pause
exit /b

:found
echo ========================================================
echo   Starting LTC Intern System...
echo ========================================================
echo Location: %cd%
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not installed!
    echo Please download and install Node.js from: https://nodejs.org
    echo.
    pause
    exit /b
)

if not exist "node_modules\" (
    echo [INFO] Installing packages for the first time...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed.
        pause
        exit /b
    )
    echo.
)

start /b cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:3000"

echo [OK] Next.js server starting...
echo [OK] Browser will automatically open http://localhost:3000
echo.
echo ========================================================
echo   System is running! Do not close this window.
echo   To stop, press Ctrl+C or close this window.
echo ========================================================
echo.

call npm run dev

pause
