@echo off
REM Neon Sehir v133 - cift tiklayinca deploy + push (deploy-v133.ps1)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-v133.ps1"
echo.
pause
