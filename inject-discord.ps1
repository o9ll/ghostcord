# ==============================================================================
#  Ghostcord — Post-Installation Injection Script
#  Used by Inno Setup installer to inject Ghostcord into Discord.
# ==============================================================================

param(
    [string]$AppDir = $PSScriptRoot
)

$ErrorActionPreference = "Continue"

# 1. Locate Discord Stable
$DiscordPath = Join-Path $env:LOCALAPPDATA "Discord"
if (-not (Test-Path $DiscordPath)) {
    exit 0
}

# Find the most recent version (app-*)
$LatestApp = Get-ChildItem $DiscordPath -Filter "app-*" | Sort-Object Name -Descending | Select-Object -First 1
if (-not $LatestApp) {
    exit 0
}

$CoreDir = Join-Path $LatestApp.FullName "resources"
$InjectDir = Join-Path $CoreDir "app"

# 2. Create the injection
if (-not (Test-Path $InjectDir)) {
    New-Item -ItemType Directory -Path $InjectDir -Force | Out-Null
}

# Generate package.json for injection
$PackageJson = @{
    name = "discord"
    main = "index.js"
} | ConvertTo-Json

Set-Content -Path (Join-Path $InjectDir "package.json") -Value $PackageJson

# Generate index.js for injection
# Points to patcher.js in the Ghostcord installation directory
$GhostcordPatcher = Join-Path $AppDir "dist\desktop\patcher.js"
$GhostcordPatcher = $GhostcordPatcher.Replace("\", "\\")

$IndexJs = @"
\"use strict\";
const path = require(\"path\");
const fs = require(\"fs\");

// Injection Ghostcord
try {
    require(\"$GhostcordPatcher\");
} catch (e) {
    console.error(\"Ghostcord injection failed:\", e);
    // Fallback sur Discord original si possible
    const originalAsar = path.join(__dirname, \"..\", \"_app.asar\");
    if (fs.existsSync(originalAsar)) {
        require(originalAsar);
    }
}
"@

Set-Content -Path (Join-Path $InjectDir "index.js") -Value $IndexJs

exit 0
