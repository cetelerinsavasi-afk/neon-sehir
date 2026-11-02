@echo off
REM Neon Sehir v141 - cift tiklayinca: sunucu fonksiyonlari (3 grup) + push (deploy-v141.ps1)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-v141.ps1"
echo.
pause
