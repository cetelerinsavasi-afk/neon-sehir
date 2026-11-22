@echo off
REM Neon Sehir v177 GERI AL: _v177\yedek'teki eski dosyalari yerine koyar, v177'nin yeni
REM dosyalarini siler (sadece bilgisayarinda). Yayindan da geri almak icin sonra:
REM firebase deploy + git commit + push gerekir (Claude'a sor).
setlocal
set "HERE=%~dp0"
cd /d "%HERE%.."
if not exist "package.json" goto yanlis
if not exist "%HERE%yedek" (
  echo _v177\yedek yok - once yukle-v177.bat calismamis. HICBIR SEY YAPILMADI.
  goto son
)
xcopy "%HERE%yedek\*" "%CD%" /E /Y /I /Q >nul
for %%F in (functions\fleet.js functions\stable.js functions\scripts\fleet.test.mjs preview\fleet.html preview\fleet-app.jsx preview\market.html preview\market-app.jsx src\components\MotorGallery\MotorGalleryScreen.jsx src\components\MotorGallery\MotorGalleryScreen.css) do if exist "%%F" del /q "%%F"
if exist "src\components\MotorGallery" rd "src\components\MotorGallery" 2>nul
echo Eski dosyalar yerine kondu, v177'nin yeni dosyalari silindi.
goto son

:yanlis
echo Bu _v177 klasoru neon-sehir klasorunun ICINDE olmali. HICBIR SEY YAPILMADI.

:son
echo.
pause
