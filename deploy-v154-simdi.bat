@echo off
REM Neon Sehir v154 - YOGUN SAATTE DE hemen yukler (saat kontrolu atlanir). Gerisi deploy-v154.bat ile ayni.
cd /d "%~dp0"
set NEON_SIMDI=1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-v154.ps1"
echo.
pause
