@echo off
REM Neon Sehir v183 GERI AL: _v183\yedek'teki eski dosyalari yerine koyar, v183'nin yeni
REM dosyalarini siler (sadece bilgisayarinda). Yayindan da geri almak icin sonra:
REM firebase deploy + git commit + push gerekir (Claude'a sor).
setlocal
set "HERE=%~dp0"
cd /d "%HERE%.."
if not exist "package.json" goto yanlis
if not exist "%HERE%yedek" (
  echo _v183\yedek yok - once yukle-v183.bat calismamis. HICBIR SEY YAPILMADI.
  goto son
)
xcopy "%HERE%yedek\*" "%CD%" /E /Y /I /Q >nul
echo Eski dosyalar yerine kondu, 
goto son

:yanlis
echo Bu _v183 klasoru neon-sehir klasorunun ICINDE olmali. HICBIR SEY YAPILMADI.

:son
echo.
pause
