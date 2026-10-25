@echo off
REM Neon Sehir v131 - cift tiklayinca deploy + push (deploy-v131.ps1)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-v131.ps1"
echo.
pause
