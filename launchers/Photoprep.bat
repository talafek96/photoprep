@echo off
REM Photoprep - double-click to start.
cd /d "%~dp0.."

where node >nul 2>nul
if errorlevel 1 (
  echo Photoprep needs Node.js, which doesn't seem to be installed.
  echo Get it from https://nodejs.org ^(the "LTS" button^), then double-click this again.
  echo.
  pause
  exit /b 1
)

echo Starting Photoprep - your browser will open in a moment.
echo Keep this window open while you work. Close it when you're done.
echo.
node bin\cli.js %*
pause
