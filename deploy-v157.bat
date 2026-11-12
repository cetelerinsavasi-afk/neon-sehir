@echo off
REM Neon Sehir v157 - Gezilebilir sehir yenilendi. (deploy-v157.ps1)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-v157.ps1"
echo.
pause
