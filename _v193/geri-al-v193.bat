@echo off
REM Neon Sehir v193 GERI AL: _v193\yedek'teki eski dosyalari yerine koyar ve v193'nin
REM ekledigi YENI dosyalari (yedek\_yeni.txt listesi) siler - sadece bilgisayarinda.
REM Yayindan da geri almak icin sonra: firebase deploy (borsaAction, cronTick, cityAction) + git commit + push gerekir
REM (Claude'a sor). Borsadaki yeni alanlar (dk, d0) eski kodda zararsizdir, yok sayilir.
setlocal
set "HERE=%~dp0"
cd /d "%HERE%.."
if not exist "package.json" goto yanlis
if not exist "%HERE%yedek" (
  echo _v193\yedek yok - once yukle-v193.bat calismamis. HICBIR SEY YAPILMADI.
  goto son
)
if exist "%HERE%yedek\_yeni.txt" (
  for /f "usebackq delims=" %%F in ("%HERE%yedek\_yeni.txt") do (
    if exist "%%F" del /q "%%F"
  )
)
xcopy "%HERE%yedek\*" "%CD%" /E /Y /I /Q >nul
if exist "_yeni.txt" del /q "_yeni.txt"
echo Eski dosyalar yerine kondu, v193'nin yeni dosyalari silindi.
goto son

:yanlis
echo Bu _v193 klasoru neon-sehir klasorunun ICINDE olmali. HICBIR SEY YAPILMADI.

:son
echo.
pause
