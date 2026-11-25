@echo off
REM ============================================================================
REM Neon Sehir v204 GERI ALMA
REM   v204 commit'ini geri alan yeni bir commit atar (gecmis silinmez), 6 fonksiyonu
REM   eski haline yukler, push eder. Oyuncu verisine dokunmaz. Fabrika belgelerindeki
REM   minTrig alani zararsizdir, eski kod onu okumaz.
REM   Silinen 3 eski fonksiyon (presence*) geri gelmez; zaten kullanilmiyorlardi.
REM ============================================================================
setlocal EnableExtensions
cd /d "%~dp0"
if not exist ".git" goto yanlis

set "SAYI=0"
set "HATA="
for /f "tokens=1,2" %%A in ('git log --format^="%%H %%s" -n 200') do (
  if "%%B"=="v204:" call :geri %%A
)
if "%SAYI%"=="0" (
  echo v204 commit'i bulunamadi. HICBIR SEY YAPILMADI.
  goto son
)
if not "%HATA%"=="" (
  echo git revert basarisiz ^(cakisma olabilir^). "git revert --abort" yazip Claude'a haber ver.
  goto son
)
git commit -q -m "Revert v204 (Firestore okuma azaltma, spor salonu mini oyun boyutu, banyo renkleri)"
if errorlevel 1 (
  echo Geri alma commit'i atilamadi. Ciktiyi Claude'a gonder.
  goto son
)

echo.
echo ===== Firebase: 6 fonksiyon eski haline =====
call firebase deploy --only functions:getCreditInfo,functions:takeCredit,functions:getFactoryValue,functions:buyFactoryMachine,functions:triggerAllMining,functions:runFactoryMachines
if errorlevel 1 (
  echo Firebase yuklenemedi. push YAPILMADI. Ciktiyi Claude'a gonder.
  goto son
)

git push
if errorlevel 1 (
  echo git push basarisiz. Ciktiyi Claude'a gonder.
  goto son
)
echo TAMAM: v204 geri alindi. Cloudflare birkac dakika icinde eski siteyi yayinlar.
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
