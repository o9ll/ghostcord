@echo off
:: Wrapper .bat to easily launch ghostcord-uninstall.ps1 (double-click)
title Ghostcord — Uninstall
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ghostcord-uninstall.ps1"
if %errorlevel% neq 0 pause

