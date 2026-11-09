@echo off
REM Neon Sehir v149 - cift tiklayinca: zip'i yerlestir + derle + test + RTDB kurali + commit + push (deploy-v149.ps1)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-v149.ps1"
echo.
pause
