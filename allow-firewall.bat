@echo off
title Open Port 3000 in Windows Firewall
echo ======================================================================
echo       REGISTRY TRACKER - ALLOW LOCAL NETWORK ACCESS (PORT 3000)
echo ======================================================================
echo.
echo Adding inbound firewall rule for TCP port 3000...
echo.

netsh advfirewall firewall add rule name="Registry File Tracker (Port 3000)" dir=in action=allow protocol=TCP localport=3000

echo.
if %ERRORLEVEL% EQU 0 (
    echo ======================================================================
    echo  SUCCESS: Port 3000 is now accessible to all devices on your office Wi-Fi!
    echo ======================================================================
) else (
    echo ======================================================================
    echo  FAILED: Administrator permissions required.
    echo  Right-click this file and select "Run as administrator".
    echo ======================================================================
)
echo.
pause
