@echo off
REM Neon Sehir v151 - YOGUN SAATTE DE yukler (saat kontrolunu atlar). Yukleme ~15 dk surer; bu sirada oyuncular kisa sureli hata gorebilir.
cd /d "%~dp0"
set NEON_SIMDI=1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-v151.ps1"
echo.
pause
