@echo off
REM Neon Sehir v146.4 - cift tiklayinca: houseAction + recordVenueVisit + commit + push (deploy-v146-4.ps1)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-v146-4.ps1"
echo.
pause
