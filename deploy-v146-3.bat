@echo off
REM Neon Sehir v146.3 - cift tiklayinca: commit + push (deploy-v146-3.ps1)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-v146-3.ps1"
echo.
pause
