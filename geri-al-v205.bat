@echo off
REM ============================================================================
REM Neon Sehir v205 GERI ALMA (sadece site; sunucu degismedigi icin Firebase'e dokunulmaz)
REM   v205 commit'ini geri alan yeni bir commit atar ve push eder. Oyuncu verisine dokunmaz.
REM ============================================================================
setlocal EnableExtensions
cd /d "%~dp0"
if not exist ".git" goto yanlis
set "SAYI=0"
set "HATA="
for /f "tokens=1,2" %%A in ('git log --format^="%%H %%s" -n 200') do (
  if "%%B"=="v205:" call :geri %%A
)
if "%SAYI%"=="0" (
  echo v205 commit'i bulunamadi. HICBIR SEY YAPILMADI.
  goto son
)
if not "%HATA%"=="" (
  echo git revert basarisiz ^(cakisma olabilir^). "git revert --abort" yazip Claude'a haber ver.
  goto son
)
git commit -q -m "Revert v205 (futbol verisi cihazdan, hafif futbol dinleyicileri)"
if errorlevel 1 (
  echo Geri alma commit'i atilamadi. Ciktiyi Claude'a gonder.
  goto son
)
git push
if errorlevel 1 (
  echo git push basarisiz. Ciktiyi Claude'a gonder.
  goto son
)
echo TAMAM: v205 geri alindi. Cloudflare birkac dakika icinde eski siteyi yayinlar.
goto son

:geri
if not "%HATA%"=="" goto :eof
echo Geri aliniyor: %1
git revert --no-commit %1
if errorlevel 1 set "HATA=1"
set /a SAYI+=1
goto :eof

:yanlis
echo Bu dosya neon-sehir klasorunun ICINDE olmali. HICBIR SEY YAPILMADI.

:son
echo.
pause
