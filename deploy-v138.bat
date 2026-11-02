@echo off
REM Neon Sehir v138 - cift tiklayinca her sey kendiliginden: kurallar + fonksiyonlar + push (deploy-v138.ps1)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-v138.ps1"
echo.
pause
