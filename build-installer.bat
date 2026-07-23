@echo off
title Ghostcord Installer - Build
cd /d "%~dp0"

echo.
echo  ================================
echo   Ghostcord Installer - Build
echo  ================================
echo.

:: Check that node is available
where node >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Node.js not found. Install Node.js from https://nodejs.org
    pause
    exit /b 1
)

:: Create output directory if needed
if not exist "release\installer" mkdir "release\installer"

:: Enter the installer-src directory
cd installer-src

:: Install dependencies if node_modules missing
if not exist "node_modules" (
    echo  [1/3] Installing npm dependencies...
    npm install --legacy-peer-deps
    if errorlevel 1 (
        echo  [ERROR] npm install failed.
        cd ..
        pause
        exit /b 1
    )
    echo  [1/3] Dependencies installed.
) else (
    echo  [1/3] Dependencies already present, skipping.
)

:: Compile with electron-webpack
echo.
echo  [2/3] Webpack compilation (electron-webpack)...
call npm run compile
if errorlevel 1 (
    echo  [ERROR] Webpack compilation failed.
    cd ..
    pause
    exit /b 1
)
echo  [2/3] Webpack compilation successful.

:: Build electron-builder -> Ghostcord-Installer.exe in ../release/installer/
echo.
echo  [3/3] Packaging electron-builder...
call npx electron-builder --win -p never
if errorlevel 1 (
    echo  [ERROR] electron-builder failed.
    cd ..
    pause
    exit /b 1
)

cd ..

:: Verification
if not exist "release\installer\Ghostcord-Installer.exe" (
    echo.
    echo  [ERROR] Ghostcord-Installer.exe not found after build.
    pause
    exit /b 1
)

for %%F in ("release\installer\Ghostcord-Installer.exe") do (
    echo.
    echo  [OK] Build successful!
    echo  File: release\installer\Ghostcord-Installer.exe  (%%~zF bytes)
    echo.
)

:: Open the output directory
explorer release\installer

pause

