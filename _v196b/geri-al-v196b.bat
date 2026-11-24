@echo off
REM Neon Sehir v196b GERI AL: _v196b\yedek'teki eski dosyalari yerine koyar - sadece bilgisayarinda.
REM Yayindan da geri almak icin sonra: firebase deploy --only functions + git commit + push (Claude'a sor).
setlocal
set "HERE=%~dp0"
cd /d "%HERE%.."
if not exist "package.json" goto yanlis
if not exist "%HERE%yedek" (
  echo _v196b\yedek yok - once yukle-v196b.bat calismamis. HICBIR SEY YAPILMADI.
  goto son
)
xcopy "%HERE%yedek\*" "%CD%" /E /Y /I /Q >nul
echo Eski dosyalar yerine kondu.
goto son

:yanlis
echo Bu _v196b klasoru neon-sehir klasorunun ICINDE olmali. HICBIR SEY YAPILMADI.

:son
echo.
pause
