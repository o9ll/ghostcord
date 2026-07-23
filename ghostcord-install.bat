@echo off
:: Wrapper .bat to easily launch ghostcord-install.ps1 (double-click)
title Ghostcord — Install
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ghostcord-install.ps1"
if %errorlevel% neq 0 pause

