@echo off
setlocal
cd /d "%~dp0"

echo Creating Desktop shortcuts...

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell; " ^
  "$desktop = [Environment]::GetFolderPath('Desktop'); " ^
  "$vbsPath = [System.IO.Path]::Combine('%~dp0', 'Launch-Tracker-Silent.vbs'); " ^
  "$stopPath = [System.IO.Path]::Combine('%~dp0', 'Stop-Tracker.bat'); " ^
  "$wscriptExe = [System.IO.Path]::Combine($env:SystemRoot, 'System32\wscript.exe'); " ^
  "try { " ^
  "  $s1 = $ws.CreateShortcut([System.IO.Path]::Combine($desktop, 'Registry File Tracker.lnk')); " ^
  "  $s1.TargetPath = $wscriptExe; " ^
  "  $s1.Arguments = '\"' + $vbsPath + '\"'; " ^
  "  $s1.WorkingDirectory = '%~dp0'; " ^
  "  $s1.IconLocation = 'shell32.dll,43'; " ^
  "  $s1.Description = 'Registry Office File Tracker (Opens directly in browser - Zero command prompt)'; " ^
  "  $s1.Save(); " ^
  "  $s2 = $ws.CreateShortcut([System.IO.Path]::Combine($desktop, 'Stop Registry Tracker.lnk')); " ^
  "  $s2.TargetPath = $stopPath; " ^
  "  $s2.WorkingDirectory = '%~dp0'; " ^
  "  $s2.IconLocation = 'shell32.dll,131'; " ^
  "  $s2.Description = 'Stop the Registry File Tracker background services'; " ^
  "  $s2.Save(); " ^
  "  exit 0; " ^
  "} catch { Write-Warning $_; exit 1; }"

if %ERRORLEVEL% EQU 0 (
    echo ======================================================================
    echo  SUCCESS: Shortcuts created on your Desktop!
    echo.
    echo   1. [Registry File Tracker] - Opens directly in your browser
    echo                                [ZERO command prompt window]
    echo.
    echo   2. [Stop Registry Tracker] - Closes background tracker services
    echo ======================================================================
) else (
    echo Could not create shortcuts automatically.
)
echo.
pause
