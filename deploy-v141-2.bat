@echo off
REM Neon Sehir v141.2 - cift tiklayinca: commit + push (deploy-v141-2.ps1)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-v141-2.ps1"
echo.
pause
