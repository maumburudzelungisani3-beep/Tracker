@echo off
setlocal
cd /d "%~dp0"
title Registry Office File Tracker Launcher
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0bin\launch-online.ps1"

