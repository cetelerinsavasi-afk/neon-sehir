@echo off
REM Neon Sehir v196 GERI AL: _v196\yedek'teki eski dosyalari yerine koyar (silinen eski testler dahil) ve
REM v196'nin ekledigi YENI dosyalari (yedek\_yeni.txt) siler - sadece bilgisayarinda.
REM Yayindan da geri almak icin sonra: firebase deploy --only functions + git commit + push (Claude'a sor).
REM UYARI: gecis (Uygula) GERI ALINMAZ - veriler icin yedekten gcloud firestore import gerekir.
REM Asama 1'i geri almak icin: asama1\yedek ayni sekilde (bu dosya once tam surumu geri alir).
setlocal
set "HERE=%~dp0"
cd /d "%HERE%.."
if not exist "package.json" goto yanlis
if not exist "%HERE%yedek" (
  echo _v196\yedek yok - once yukle-v196.bat calismamis. HICBIR SEY YAPILMADI.
  goto son
)
if exist "%HERE%yedek\_yeni.txt" (
  for /f "usebackq delims=" %%F in ("%HERE%yedek\_yeni.txt") do (
    if exist "%%F" del /q "%%F"
  )
)
xcopy "%HERE%yedek\*" "%CD%" /E /Y /I /Q >nul
if exist "_yeni.txt" del /q "_yeni.txt"
echo Eski dosyalar yerine kondu, v196'nin yeni dosyalari silindi.
goto son

:yanlis
echo Bu _v196 klasoru neon-sehir klasorunun ICINDE olmali. HICBIR SEY YAPILMADI.

:son
echo.
pause
