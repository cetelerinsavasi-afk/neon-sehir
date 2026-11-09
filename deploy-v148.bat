@echo off
REM Neon Sehir v148 - cift tiklayinca: zip'i yerlestir + derleme + test + commit + push (deploy-v148.ps1)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-v148.ps1"
echo.
pause
