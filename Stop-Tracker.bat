@echo off
setlocal
cd /d "%~dp0"
title Stop Registry Tracker

echo Stopping Registry File Tracker and Cloudflare services...

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$pidFile = Join-Path '%~dp0' 'data\tracker.pids'; " ^
  "if (Test-Path $pidFile) { " ^
  "    Get-Content $pidFile | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }; " ^
  "    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue; " ^
  "}; " ^
  "Stop-Process -Name 'cloudflared*' -Force -ErrorAction SilentlyContinue; " ^
  "try { Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*server.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } } catch {}; " ^
  "try { Get-WmiObject Win32_Process | Where-Object { $_.CommandLine -like '*server.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } } catch {}"

echo ======================================================================
echo  Registry File Tracker has been stopped successfully.
echo ======================================================================
ping 127.0.0.1 -n 3 >nul
