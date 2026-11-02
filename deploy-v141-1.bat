@echo off
REM Neon Sehir v141.1 - cift tiklayinca: shopAction + push (deploy-v141-1.ps1)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-v141-1.ps1"
echo.
pause
