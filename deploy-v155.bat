@echo off
REM Neon Sehir v155 - Zumrut Magazasi (web tarafi). Sunucuya dokunmaz. (deploy-v155.ps1)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-v155.ps1"
echo.
pause
