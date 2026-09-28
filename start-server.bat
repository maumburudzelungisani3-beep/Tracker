@echo off
setlocal enabledelayedexpansion
title Registry Office File Tracker Server
cd /d "%~dp0"

set IP=10.100.1.21
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4 Address"') do (
    set CURRENT_IP=%%a
    set CURRENT_IP=!CURRENT_IP: =!
    if not "!CURRENT_IP:~0,7!"=="169.254" (
        set IP=!CURRENT_IP!
        goto :found_ip
    )
)
:found_ip

echo ======================================================================
echo           REGISTRY OFFICE FILE TRACKER - LOCAL NETWORK SERVER
echo ======================================================================
echo.
echo  [+] Access on THIS computer:
echo      http://localhost:3000
echo.
echo  [+] Share with colleagues on the office Wi-Fi / Local Network:
echo      http://!IP!:3000
echo.
echo  Leave this window open while the office is using the system.
echo  To close, simply close this window or press Ctrl+C.
echo ======================================================================
echo.

node server.js
pause
