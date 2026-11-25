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

set "H="
REM Mesaji "v203:" ile BASLAYAN en son commit (Revert commit'leri atlanir)
for /f "tokens=1,2" %%A in ('git log --format^="%%H %%s" --fixed-strings --grep^="v203: profilde"') do if not defined H if "%%B"=="v203:" set "H=%%A"
if "%H%"=="" (
  echo v203 commit'i bulunamadi. HICBIR SEY YAPILMADI.
  goto son
)
echo Geri alinacak commit: %H%
git revert --no-edit %H%
if errorlevel 1 (
  echo git revert basarisiz ^(cakisma olabilir^). "git revert --abort" yazip Claude'a haber ver.
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

:yanlis
echo Bu dosya neon-sehir klasorunun ICINDE olmali. HICBIR SEY YAPILMADI.

:son
echo.
pause
