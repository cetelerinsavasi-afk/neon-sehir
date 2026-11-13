@echo off
REM Neon Sehir v159 - TEK TIK: derler, test eder, commit + push eder (Cloudflare siteyi yayinlar).
setlocal
set "PROJE="
for %%D in ("%~dp0." "%USERPROFILE%\Downloads\neon-sehir" "%USERPROFILE%\Downloads\neon-sehir\neon-sehir") do (
  if not defined PROJE if exist "%%~D\package.json" if exist "%%~D\deploy-v159.ps1" set "PROJE=%%~fD"
)
if not defined PROJE (
  echo neon-sehir proje klasoru ^(deploy-v159.ps1 ile^) bulunamadi.
  goto son
)
echo Proje: %PROJE%
echo.
cd /d "%PROJE%"
powershell -NoProfile -ExecutionPolicy Bypass -File "%PROJE%\deploy-v159.ps1"
:son
echo.
pause
