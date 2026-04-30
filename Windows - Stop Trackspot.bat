@echo off
setlocal

cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows-stop-trackspot.ps1"
set "TRACKSPOT_EXIT=%ERRORLEVEL%"

if not "%TRACKSPOT_EXIT%"=="0" (
  echo.
  pause
)

exit /b %TRACKSPOT_EXIT%
