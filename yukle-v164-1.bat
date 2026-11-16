@echo off
REM ============================================================================
REM Neon Sehir v164.1 - TEK TIK: derler, test eder, commit + push eder ve Cloudflare'i bekler.
REM   - Bellek: avatar arka dokulari sadece arabada / tribunde arkadan ilk gorulunce cizilir
REM     (avatar basina 8 yerine 4 doku). Yururken avatar eskisi gibi onden gorunur.
REM   - Ev / mekan iclerindeki v164 degisikligi geri alindi (eski hali).
REM Bu surumde Firebase fonksiyonu ve veritabani kurali DEGISMEDI (sadece site).
REM Calistirma: bu dosyaya cift tikla (neon-sehir klasorunun icinde olmali).
REM ============================================================================
setlocal
cd /d "%~dp0"
if not exist "package.json" goto yanlis
if not exist "src\components\City\cityEngine.js" goto yanlis
if not exist ".git" goto yanlis
if not exist "src\hooks\useMatchLive.js" (
  echo v164 dosyalari bulunamadi ^(src\hooks\useMatchLive.js yok^). HICBIR SEY YAPILMADI.
  goto son
)

echo.
echo ===== arayuz derleme kontrolu =====
call npm run build
if errorlevel 1 (
  echo.
  echo Arayuz derlenemedi. HICBIR SEY GONDERILMEDI. Ciktiyi Claude'a gonder.
  goto son
)

echo.
echo ===== testler =====
set "TESTLER="
for %%T in ("tests\webview\webview.test.mjs" "tests\city\jobs-resume.test.mjs" "tests\city\kurye.test.mjs" "tests\city\nav-route.test.mjs" "functions\scripts\six-image.test.mjs") do (
  if exist "%%~T" call set "TESTLER=%%TESTLER%% %%~T"
)
if defined TESTLER (
  node --test %TESTLER%
  if errorlevel 1 (
    echo.
    echo Testler basarisiz. HICBIR SEY GONDERILMEDI. Ciktiyi Claude'a gonder.
    goto son
  )
)

echo.
echo ===== git commit + push =====
set GIT_ASK_YESNO=false
git add -- src/components/City/cityEngine.js src/components/HouseScreen/houseEngine.js yukle-v164-1.bat
git commit -q -m "v164.1: avatar arka dokulari sadece arabada / tribunde ilk gerektiginde cizilir (8 yerine 4 doku), yururken sirt gorunmesi ve ev ici degisikligi geri alindi" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01YQymXPB7KvQ27BGAQhn9PE"
if errorlevel 1 (
  echo.
  echo git commit basarisiz ^(belki degisiklik yok ya da zaten commit edildi^). Ciktiyi Claude'a gonder.
  goto son
)
git push
if errorlevel 1 (
  echo.
  echo git push basarisiz. Site gonderilmedi. Ciktiyi Claude'a gonder.
  goto son
)

echo.
echo ===== Cloudflare derlemesi bekleniyor (en fazla ~8 dk) =====
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $sha=(git rev-parse HEAD).Trim(); $url='https://api.github.com/repos/cetelerinsavasi-afk/neon-sehir/commits/'+$sha+'/check-runs'; $sonuc=$null; for($i=0;$i -lt 32;$i++){ Start-Sleep -Seconds 15; try{ $r=Invoke-RestMethod -Uri $url -Headers @{'User-Agent'='neon-sehir-deploy';'Accept'='application/vnd.github+json'} }catch{ continue }; $cf=$r.check_runs | Where-Object { $_.name -like 'Workers Builds*' } | Select-Object -First 1; if(-not $cf){ Write-Host '  ...Cloudflare henuz baslamadi'; continue }; if($cf.status -ne 'completed'){ Write-Host '  ...Cloudflare derliyor'; continue }; $sonuc=$cf.conclusion; break }; Write-Host ''; if($sonuc -eq 'success'){ Write-Host 'TAMAM: v164.1 yayinda. Oyunu yenile (bilgisayarda Ctrl+F5, telefonda uygulamayi kapatip ac).' -ForegroundColor Green } elseif($sonuc){ Write-Host ('Cloudflare derlemesi BASARISIZ ('+$sonuc+'). Cloudflare panelinde Workers > neon-sehir > Deployments hata kaydini Claude''a gonder.') -ForegroundColor Red } else { Write-Host 'Cloudflare 8 dk icinde derlemeyi bitirmedi. Cloudflare panelinde Workers > neon-sehir > Deployments''ta son commit icin Retry build de.' -ForegroundColor Yellow }"
goto son

:yanlis
echo Bu dosya neon-sehir proje klasorunun ICINDE olmali. HICBIR SEY YAPILMADI.

:son
echo.
pause
