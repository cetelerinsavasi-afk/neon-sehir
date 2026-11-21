@echo off
REM Neon Sehir v175 GERI AL: _v175\yedek'teki eski dosyalari yerine koyar (sadece bilgisayarinda).
REM Yayindan da geri almak icin sonra: git add + commit + push (Claude'a sor).
setlocal
set "HERE=%~dp0"
cd /d "%HERE%.."
if not exist "package.json" goto yanlis
if not exist "%HERE%yedek\src" (
  echo _v175\yedek yok - once yukle-v175.bat calismamis. HICBIR SEY YAPILMADI.
  goto son
)
xcopy "%HERE%yedek\*" "%CD%" /E /Y /I /Q >nul
if errorlevel 1 (
  echo Geri alinamadi. Ciktiyi Claude'a gonder.
  goto son
)
echo Eski dosyalar yerine kondu.
goto son

:yanlis
echo Bu _v175 klasoru neon-sehir klasorunun ICINDE olmali. HICBIR SEY YAPILMADI.

:son
echo.
pause
