@echo off
REM Neon Sehir v154 - cift tiklayinca: zip'i yerlestir + derle + test + RTDB kurali + fonksiyonlar + commit + push (deploy-v154.ps1)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-v154.ps1"
echo.
pause
