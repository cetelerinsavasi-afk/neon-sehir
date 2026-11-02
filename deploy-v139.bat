@echo off
REM Neon Sehir v139 - cift tiklayinca: gangAction + push (deploy-v139.ps1)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-v139.ps1"
echo.
pause
