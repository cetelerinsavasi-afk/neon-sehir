@echo off
REM Neon Sehir v146.1 - cift tiklayinca: fonksiyonlar + commit + push (deploy-v146-1.ps1)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-v146-1.ps1"
echo.
pause
