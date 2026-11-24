@echo off
REM Neon Sehir v196e GERI AL: _v196e\yedek'teki eski dosyalari yerine koyar - sadece bilgisayarinda.
REM Yayindan da geri almak icin sonra: firebase deploy --only functions + git commit + push (Claude'a sor).
setlocal
set "HERE=%~dp0"
cd /d "%HERE%.."
if not exist "package.json" goto yanlis
if not exist "%HERE%yedek" (
  echo _v196e\yedek yok - once yukle-v196e.bat calismamis. HICBIR SEY YAPILMADI.
  goto son
)
xcopy "%HERE%yedek\*" "%CD%" /E /Y /I /Q >nul
echo Eski dosyalar yerine kondu.
goto son

:yanlis
echo Bu _v196e klasoru neon-sehir klasorunun ICINDE olmali. HICBIR SEY YAPILMADI.

:son
echo.
pause
