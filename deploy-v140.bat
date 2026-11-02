@echo off
REM Neon Sehir v140 - cift tiklayinca: shopAction + createSixtagramPost + push (deploy-v140.ps1)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-v140.ps1"
echo.
pause
