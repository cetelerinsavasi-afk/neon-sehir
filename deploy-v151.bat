@echo off
REM Neon Sehir v151 - cift tiklayinca: zip'i yerlestir + derle + test + RTDB kurali + fonksiyonlar + testler + commit + push (deploy-v151.ps1)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-v151.ps1"
echo.
pause
