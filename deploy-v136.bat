@echo off
REM Neon Sehir v136 - cift tiklayinca deploy + push (deploy-v136.ps1)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-v136.ps1"
echo.
pause
