@echo off
REM ============================================================================
REM Neon Sehir v203 GERI ALMA
REM   v203 commit'ini geri alan yeni bir commit atar (gecmis silinmez), iki yaris
REM   fonksiyonunu eski haline (sabit 100.000 sinir) geri yukler, push eder.
REM   Oyuncu verisine dokunmaz. Acik yaris odalari oldugu gibi kalir.
REM   Not: Android v18 AAB'yi Play'e yuklediysen o ayrica geri alinmaz; ama v18
REM   eski site ile de sorunsuz calisir (paylas butonu sitede olmadigi icin gorunmez).
REM ============================================================================
setlocal EnableExtensions
cd /d "%~dp0"
if not exist ".git" goto yanlis

REM v203 ve v203.1 commit'lerini (en yeniden eskiye) tek bir geri alma commit'inde geri alir.
REM Mesaji "v203:" ya da "v203.1:" ile BASLAYANLAR alinir; Revert commit'leri atlanir.
set "SAYI=0"
set "HATA="
for /f "tokens=1,2" %%A in ('git log --format^="%%H %%s" -n 200') do (
  if "%%B"=="v203:" call :geri %%A
  if "%%B"=="v203.1:" call :geri %%A
)
if "%SAYI%"=="0" (
  echo v203 commit'i bulunamadi. HICBIR SEY YAPILMADI.
  goto son
)
if not "%HATA%"=="" (
  echo git revert basarisiz ^(cakisma olabilir^). "git revert --abort" yazip Claude'a haber ver.
  goto son
)
git commit -q -m "Revert v203 (davet/degerlendir butonlari, yarista araba basina bahis siniri)"
if errorlevel 1 (
  echo Geri alma commit'i atilamadi. Ciktiyi Claude'a gonder.
  goto son
)

echo.
echo ===== Firebase: iki yaris fonksiyonu eski haline =====
call firebase deploy --only functions:createRaceRoom,functions:joinRaceRoom
if errorlevel 1 (
  echo Firebase yuklenemedi. push YAPILMADI. Ciktiyi Claude'a gonder.
  goto son
)

git push
if errorlevel 1 (
  echo git push basarisiz. Ciktiyi Claude'a gonder.
  goto son
)
echo TAMAM: v203 geri alindi. Cloudflare birkac dakika icinde eski siteyi yayinlar.
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
