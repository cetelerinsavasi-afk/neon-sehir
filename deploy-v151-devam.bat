@echo off
REM Neon Sehir v151 - DEVAM: kalan fonksiyonlar + commit + push (deploy-v151-devam.ps1)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-v151-devam.ps1"
echo.
pause
