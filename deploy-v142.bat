@echo off
REM Neon Sehir v142 - cift tiklayinca: sunucu fonksiyonlari + commit + push (deploy-v142.ps1)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-v142.ps1"
echo.
pause
