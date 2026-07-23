# build-installer.ps1 — Build Ghostcord-Installer.exe (Electron + electron-builder)
# Usage: .\build-installer.ps1

$ErrorActionPreference = "Stop"
$Root      = $PSScriptRoot
$SrcDir    = Join-Path $Root "installer-src"
$OutDir    = Join-Path $Root "release\installer"
$OutExe    = Join-Path $OutDir "Ghostcord-Installer.exe"

Write-Host ""
Write-Host "  [Ghostcord] Building Electron installer..." -ForegroundColor Cyan

# ── Prerequisites ────────────────────────────────────────────────────────────
$nodeOk = $null
try { $nodeOk = & node --version 2>$null } catch {}
if (-not $nodeOk) {
    Write-Host "  [ERROR] Node.js not found. Install it from https://nodejs.org" -ForegroundColor Red
    exit 1
}
Write-Host "  Node.js : $nodeOk" -ForegroundColor DarkGray

# ── Output directory ─────────────────────────────────────────────────────────
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

# ── Install dependencies if needed ──────────────────────────────────────────
$nodeModules = Join-Path $SrcDir "node_modules"
if (-not (Test-Path $nodeModules)) {
    Write-Host "  [1/3] npm install --legacy-peer-deps..." -ForegroundColor DarkGray
    Push-Location $SrcDir
    & npm install --legacy-peer-deps
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  [ERROR] npm install failed." -ForegroundColor Red
        Pop-Location
        exit 1
    }
    Pop-Location
    Write-Host "  [1/3] Dependencies installed." -ForegroundColor Green
} else {
    Write-Host "  [1/3] node_modules present, skipping install." -ForegroundColor DarkGray
}

# ── Webpack compilation ──────────────────────────────────────────────────────
Write-Host "  [2/3] electron-webpack (compilation)..." -ForegroundColor DarkGray
Push-Location $SrcDir
& npm run compile
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [ERROR] Webpack compilation failed." -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location
Write-Host "  [2/3] Webpack OK." -ForegroundColor Green

# ── Packaging electron-builder ───────────────────────────────────────────────
Write-Host "  [3/3] electron-builder --win (packaging)..." -ForegroundColor DarkGray
Push-Location $SrcDir
& npx electron-builder --win -p never
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [ERROR] electron-builder failed." -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location
Write-Host "  [3/3] Packaging OK." -ForegroundColor Green

# ── Verification ─────────────────────────────────────────────────────────────
if (Test-Path $OutExe) {
    $size = [math]::Round((Get-Item $OutExe).Length / 1KB, 0)
    Write-Host ""
    Write-Host "  OK  Ghostcord-Installer.exe built ($size KB)" -ForegroundColor Green
    Write-Host "    -> $OutExe" -ForegroundColor DarkGray
    Write-Host ""
} else {
    Write-Host "  [ERROR] Ghostcord-Installer.exe not found after build." -ForegroundColor Red
    exit 1
}

