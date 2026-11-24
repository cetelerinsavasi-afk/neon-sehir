@echo off
REM Neon Sehir v195 GERI AL: _v195\yedek'teki eski dosyalari yerine koyar ve v195'in
REM ekledigi YENI dosyalari (yedek\_yeni.txt listesi) siler - sadece bilgisayarinda.
REM Yayindan da geri almak icin sonra: firebase deploy --only functions + git commit + push gerekir
REM (Claude'a sor). Notlar:
REM  - Tek seferlik gecis (omru 10'dan fazla araba / ticari -> 10) geri alinmaz; eski kod 10 gunluk
REM    araclarla sorunsuz calisir (tavan 20 oldugu icin tamir edilebilirler).
REM  - Pasif mekan alanlari (biz.passive, office.passive, users.bizPassive, bizIdle) eski kodda yok sayilir:
REM    geri alinirsa pasif mekanlar tekrar listede gorunur ve para kazanir. Silinen teklifler
REM    (shopOffers) sahip stok ekleyince / fiyat degistirince yeniden yazilir.
setlocal
set "HERE=%~dp0"
cd /d "%HERE%.."
if not exist "package.json" goto yanlis
if not exist "%HERE%yedek" (
  echo _v195\yedek yok - once yukle-v195.bat calismamis. HICBIR SEY YAPILMADI.
  goto son
)
if exist "%HERE%yedek\_yeni.txt" (
  for /f "usebackq delims=" %%F in ("%HERE%yedek\_yeni.txt") do (
    if exist "%%F" del /q "%%F"
  )
)
xcopy "%HERE%yedek\*" "%CD%" /E /Y /I /Q >nul
if exist "_yeni.txt" del /q "_yeni.txt"
echo Eski dosyalar yerine kondu, v195'in yeni dosyalari silindi.
goto son

:yanlis
echo Bu _v195 klasoru neon-sehir klasorunun ICINDE olmali. HICBIR SEY YAPILMADI.

:son
echo.
pause
