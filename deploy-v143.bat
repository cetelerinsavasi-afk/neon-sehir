@echo off
REM Neon Sehir v143 - cift tiklayinca: raceHubAction + commit + push (deploy-v143.ps1)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-v143.ps1"
echo.
pause
