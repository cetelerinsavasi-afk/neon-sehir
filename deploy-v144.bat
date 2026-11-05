@echo off
REM Neon Sehir v144 - cift tiklayinca: commit + push (deploy-v144.ps1)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-v144.ps1"
echo.
pause
