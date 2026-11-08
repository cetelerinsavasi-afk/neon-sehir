@echo off
REM Neon Sehir v146 - cift tiklayinca: fonksiyonlar + kurallar + commit + push (deploy-v146.ps1)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-v146.ps1"
echo.
pause
