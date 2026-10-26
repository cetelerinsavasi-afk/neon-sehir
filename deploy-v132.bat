@echo off
REM Neon Sehir v132 - cift tiklayinca deploy + push (deploy-v132.ps1)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-v132.ps1"
echo.
pause
