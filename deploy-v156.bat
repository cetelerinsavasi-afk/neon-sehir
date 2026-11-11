@echo off
REM Neon Sehir v156 - akici soygun + benzinlik. (deploy-v156.ps1)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-v156.ps1"
echo.
pause
