@echo off
REM Neon Sehir v130 - cift tiklayinca deploy + push (deploy-v130.ps1)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-v130.ps1"
echo.
pause
