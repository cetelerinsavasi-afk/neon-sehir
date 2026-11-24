@echo off
REM ============================================================================
REM Neon Sehir v196 - ASAMA 1 (bu dosya neon-sehir\_v196\asama1 icinde olmali)
REM ONCE v195 yuklenmis olmali. Oyun AYNEN calisir; sadece su eklenir:
REM  - kapanis modu (gecis-v196.bat "Kapat" ile acilir; o ana kadar kapali)
REM  - v196 gecis adresi (yedek / deneme / uygulama). Kendiliginden HICBIR SEY yapmaz.
REM Firebase: sadece fonksiyonlar. Site DEGISMEZ (sadece commit + push).
REM Sonra: _v196\gecis-v196.bat  ->  1 Yedek, 2 Yedek durumu, 3 Kapat, 4 Deneme -> raporu Claude'a gonder.
REM Ayrinti: docs\v196-guncelleme.md
REM ============================================================================
setlocal
set "HERE=%~dp0"
cd /d "%HERE%..\.."
if not exist "package.json" goto yanlis
if not exist ".git" goto yanlis
if not exist "functions\bizPassive.js" (
  echo Once v195 yuklenmeli. HICBIR SEY YAPILMADI.
  goto son
)
if not exist "%HERE%dosyalar\functions\v196Migration.js" (
  echo _v196\asama1\dosyalar eksik. HICBIR SEY YAPILMADI.
  goto son
)

echo.
echo ===== 1/4 yedek + yeni dosyalar =====
set "DEGISEN=functions\gang\test\fakeFirestore.js functions\index.js functions\package.json functions\package-lock.json"
set "YENI=docs\v196-guncelleme.md docs\v196-plan.md functions\scripts\v196-closing.test.mjs functions\scripts\v196-migration.test.mjs functions\v196Closing.js functions\v196Migration.js functions\v196Prices.js functions\v196Shared.js"
set "SIL="
if not exist "%HERE%yedek" mkdir "%HERE%yedek"
for %%F in (%DEGISEN% %SIL%) do (
  if exist "%%F" if not exist "%HERE%yedek\%%F" xcopy "%%F" "%HERE%yedek\%%F*" /Y /Q >nul
)
if not exist "%HERE%yedek\_yeni.txt" (
  type nul > "%HERE%yedek\_yeni.txt"
  for %%F in (%YENI%) do (
    if not exist "%%F" (echo %%F>> "%HERE%yedek\_yeni.txt") else (if not exist "%HERE%yedek\%%F" xcopy "%%F" "%HERE%yedek\%%F*" /Y /Q >nul)
  )
)
xcopy "%HERE%dosyalar\*" "%CD%" /E /Y /I /Q >nul
if errorlevel 1 (
  echo Dosyalar kopyalanamadi. HICBIR SEY GONDERILMEDI. Ciktiyi Claude'a gonder.
  goto son
)
for %%F in (%SIL%) do (
  if exist "%%F" del /q "%%F"
)
echo   Dosyalar yerinde. Eski hali: _v196\asama1\yedek

echo.
echo ===== 2/4 testler =====
node --test functions\scripts\v196-migration.test.mjs functions\scripts\v196-closing.test.mjs
if errorlevel 1 (
  echo.
  echo Testler basarisiz. HICBIR SEY GONDERILMEDI. Ciktiyi Claude'a gonder.
  goto son
)
call npm --prefix functions test
if errorlevel 1 (
  echo.
  echo Sunucu testleri basarisiz. HICBIR SEY GONDERILMEDI. Ciktiyi Claude'a gonder.
  goto son
)

echo.
echo ===== 3/4 Firebase: TUM fonksiyonlar - uzun surebilir =====
REM Silinecek fonksiyon sorarsa (beklenmez) N de ve ciktiyi Claude'a gonder.
set "HEDEF=functions"
call firebase deploy --only %HEDEF%
if errorlevel 1 (
  echo.
  echo Ilk deneme basarisiz - 30 sn sonra bir kez daha deneniyor...
  timeout /t 30 /nobreak >nul
  call firebase deploy --only %HEDEF%
  if errorlevel 1 (
    echo.
    echo Firebase yuklenemedi. git push YAPILMADI ^(site degismedi^). Bu dosyayi tekrar calistir; olmazsa ciktiyi Claude'a gonder.
    goto son
  )
)

echo.
echo ===== 4/4 git commit + push (sadece asama 1 dosyalari) =====
set GIT_ASK_YESNO=false
git add -- docs/v196-plan.md functions/gang/test/fakeFirestore.js functions/index.js functions/package.json functions/scripts/v196-closing.test.mjs functions/scripts/v196-migration.test.mjs functions/v196Closing.js functions/v196Migration.js functions/v196Prices.js functions/v196Shared.js functions/package-lock.json _v196/asama1/yukle-v196-asama1.bat _v196/gecis-v196.bat docs/v196-guncelleme.md
git commit -q -m "v196 asama 1: kapanis modu + gecis adresi (yedek / deneme / uygulama), oyun aynen calisir" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_0182eo1Kgr7uUvibch1rUbXf"
if errorlevel 1 (
  echo.
  echo git commit basarisiz ^(belki zaten commit edildi^). Ciktiyi Claude'a gonder.
  goto son
)
git push
if errorlevel 1 (
  echo.
  echo git push basarisiz. Ciktiyi Claude'a gonder.
  goto son
)
echo asama1 > "%HERE%yuklendi.txt"
echo.
echo TAMAM: Asama 1 yuklendi. Simdi _v196\gecis-v196.bat : 1 Yedek -^> 2 Yedek durumu -^> 3 Kapat -^> 4 Deneme
goto son

:yanlis
echo Bu dosya neon-sehir\_v196\asama1 klasorunun ICINDE olmali. HICBIR SEY YAPILMADI.

:son
echo.
pause
