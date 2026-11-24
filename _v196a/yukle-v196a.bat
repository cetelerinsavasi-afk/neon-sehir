@echo off
REM ============================================================================
REM Neon Sehir v196a - SUNUCU ACIL DUZELTME (bu _v196a klasoru neon-sehir klasorunun ICINDE olmali)
REM  - Gecisten sonra kapanis modu biter: makine alimi yeniden acilir
REM  - Hediye mekan hisseleri (10'ar) borsada gorunur (kayit bicimi onarilir, bir kez)
REM  - Garaj: favori arac (yoksa en pahali kullanilabilir arac) + modifiyeleri
REM  - Internet kafe: 8 bilgisayar, 2 yayin seti, 2 PlayStation (sunucu tarafi)
REM  - Malzeme pazari kalici kapali
REM Firebase: sadece fonksiyonlar. Site DEGISMEZ.
REM ============================================================================
setlocal
set "HERE=%~dp0"
cd /d "%HERE%.."
if not exist "package.json" goto yanlis
if not exist "functions\home.js" (
  echo Once v196 yuklenmeli. HICBIR SEY YAPILMADI.
  goto son
)
set "DEGISEN=functions\home.js functions\index.js functions\scripts\v196-home.test.mjs functions\scripts\v196-migration.test.mjs functions\v196Closing.js functions\v196Migration.js functions\v196Shared.js"
if not exist "%HERE%yedek" mkdir "%HERE%yedek"
for %%F in (%DEGISEN%) do (
  if exist "%%F" if not exist "%HERE%yedek\%%F" xcopy "%%F" "%HERE%yedek\%%F*" /Y /Q >nul
)
xcopy "%HERE%dosyalar\*" "%CD%" /E /Y /I /Q >nul
if errorlevel 1 (
  echo Dosyalar kopyalanamadi. HICBIR SEY GONDERILMEDI.
  goto son
)

echo.
echo ===== 1/4 testler =====
call npm --prefix functions test
if errorlevel 1 (
  echo.
  echo Testler basarisiz. HICBIR SEY GONDERILMEDI. Ciktiyi Claude'a gonder.
  goto son
)

echo.
echo ===== 2/4 Firebase: fonksiyonlar =====
call firebase deploy --only functions
if errorlevel 1 (
  echo Ilk deneme basarisiz - 30 sn sonra bir kez daha...
  timeout /t 30 /nobreak >nul
  call firebase deploy --only functions
  if errorlevel 1 (
    echo Firebase yuklenemedi. Ciktiyi Claude'a gonder.
    goto son
  )
)

echo.
echo ===== 3/4 hediye hisse onarimi (bir kez; tekrar calismasi zararsiz) =====
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; try { $r = Invoke-RestMethod -TimeoutSec 600 -Uri 'https://europe-west1-neon-sehir.cloudfunctions.net/runV196MigrationNow?secret=854f8bf3de15bf540bd36a26a3cce7e5&op=fixGift'; Write-Host ('  Onarim: ' + ($r | ConvertTo-Json -Compress)) -ForegroundColor Green } catch { Write-Host ('  Onarim calismadi: ' + $_.Exception.Message) -ForegroundColor Yellow }"

echo.
echo ===== 4/4 git commit + push (sadece bu dosyalar) =====
set GIT_ASK_YESNO=false
git add -- functions/home.js functions/index.js functions/scripts/v196-home.test.mjs functions/scripts/v196-migration.test.mjs functions/v196Closing.js functions/v196Migration.js functions/v196Shared.js _v196a/yukle-v196a.bat
git commit -q -m "v196a: gecisten sonra kapanis biter (makine alimi), hediye mekan hisseleri borsada gorunur (onarim), garajda favori arac, internet kafe 8 pc + 2 yayin seti + 2 PS (sunucu), malzeme pazari kalici kapali" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_0182eo1Kgr7uUvibch1rUbXf"
git push
echo.
echo TAMAM: v196a yuklendi. Borsada mekan hisselerine ve fabrikada makine alimina bak.
goto son

:yanlis
echo Bu _v196a klasoru neon-sehir klasorunun ICINDE olmali. HICBIR SEY YAPILMADI.

:son
echo.
pause
