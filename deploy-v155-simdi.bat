@echo off
REM Neon Sehir v155 - YOGUN SAATTE DE hemen yukler (saat kontrolu atlanir).
cd /d "%~dp0"
set NEON_SIMDI=1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-v155.ps1"
echo.
pause
