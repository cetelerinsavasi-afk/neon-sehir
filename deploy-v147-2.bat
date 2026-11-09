@echo off
REM Neon Sehir v147.2 - cift tiklayinca: RTDB kurallari + fonksiyonlar + derleme + commit + push (deploy-v147-2.ps1)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-v147-2.ps1"
echo.
pause
