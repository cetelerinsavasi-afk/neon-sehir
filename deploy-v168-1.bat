@echo off
REM ============================================================================
REM Neon Sehir v168.1 - RIZA AMCA DUZELTMELERI - TEK TIK
REM   - Yeni oyuncu evin onunde dogar; sadece '3 yil once' dugmesi, basinca hikaye + gorevler baslar
REM   - Ibadet / harac / bagis gorevinde tek seferlik hak (gunluk sinir bir kez gormezden gelinir)
REM   - Sahnelerde kamerayla etrafa bakma, Amca daha hizli surer, PC'de gorev seridi dugmelerle cakismaz
REM   - Yonetici: Profil > Gorevleri sifirla
REM SITE + 15 FONKSIYON (gorev kurallari onboardingData.js ortak: HEPSI ayni anda yuklenmeli).
REM firestore.rules, database.rules.json, indeksler DEGISMEZ. Yeni dinleyici YOK.
REM Geri donus: geri-al-v168-1.bat   Kontrol listesi: docs\v168-amca-senaryosu.md
REM ============================================================================
setlocal
cd /d "%~dp0"
if not exist "package.json" goto yanlis
if not exist ".git" goto yanlis
if not exist "src\components\AdminPanel\AdminStoryReset.jsx" (
  echo v168.1 dosyalari bulunamadi ^(src\components\AdminPanel\AdminStoryReset.jsx yok^). Zip'i neon-sehir klasorune ac. HICBIR SEY YAPILMADI.
  goto son
)

echo.
echo ===== 1/5 arayuz derleme kontrolu =====
call npm run build
if errorlevel 1 (
  echo.
  echo Arayuz derlenemedi. HICBIR SEY GONDERILMEDI. Ciktiyi Claude'a gonder.
  goto son
)
if not exist "dist\prefetch-list.json" (
  echo.
  echo dist\prefetch-list.json olusmadi. HICBIR SEY GONDERILMEDI. Ciktiyi Claude'a gonder.
  goto son
)

echo.
echo ===== 2/5 testler =====
set "TESTLER="
for %%T in ("tests\webview\webview.test.mjs" "tests\city\jobs-resume.test.mjs" "tests\city\kurye.test.mjs" "tests\city\nav-route.test.mjs" "tests\clock\clock-sync.test.mjs" "tests\clock\server-clock.test.mjs" "tests\cost\daily-gate.test.mjs" "tests\cost\fs-meter.test.mjs" "tests\cost\fs-shim-off.test.mjs" "tests\cost\fs-shim-on.test.mjs" "functions\scripts\onboarding.test.mjs") do (
  if exist "%%~T" call set "TESTLER=%%TESTLER%% %%~T"
)
node --test %TESTLER%
if errorlevel 1 (
  echo.
  echo Testler basarisiz. HICBIR SEY GONDERILMEDI. Ciktiyi Claude'a gonder.
  goto son
)

echo.
echo ===== 3/5 Firebase fonksiyonlari (gorev kurallari v168.1) =====
call firebase deploy --only functions:checkOnboardingProgress,functions:completeOnboardingChecklist,functions:produceAtFactory,functions:takeVehicleLoan,functions:takeCredit,functions:prayAtMosque,functions:bribePolice,functions:buyFromVendor,functions:attemptHeist,functions:sellContrabandAtPark,functions:sendChatMessage,functions:setAvatar,functions:buyListing,functions:shopAction,functions:gangAction
if errorlevel 1 (
  echo.
  echo Fonksiyonlar yuklenemedi. git push YAPILMADI ^(site degismedi^). Biraz sonra tekrar calistir; olmazsa ciktiyi Claude'a gonder.
  goto son
)

echo.
echo ===== 4/5 git commit + push (sadece v168 / v168.1 dosyalari) =====
set GIT_ASK_YESNO=false
git add -- src/components/City/story src/components/City/CityScreen.jsx src/components/City/cityEngine.js src/components/OnboardingPanel/OnboardingPanel.jsx src/hooks/useOnboarding.js src/hooks/useTaskPass.js src/components/Venue3D/venueParts.jsx src/components/MosqueWorldScreen/MosqueWorldScreen.jsx src/components/MosqueScreen/MosqueScreen.jsx src/components/HeistPanel/HeistPanel.jsx src/components/VendorScreen/VendorScreen.jsx src/components/MekanlarScreen/SuspicionTab.jsx src/components/HomeScreen/HomeScreen.jsx src/components/AdminPanel/AdminStoryReset.jsx functions/index.js functions/onboardingData.js functions/scripts/onboarding.test.mjs preview/amca.html preview/amca-app.jsx preview/mocks/firebase-functions.js deploy-v168.bat geri-al-v168.bat deploy-v168-1.bat geri-al-v168-1.bat docs/v168-amca-senaryosu.md
git commit -q -m "v168.1: Riza Amca - yeni oyuncu 3 yil once ile baslar, ibadet/harac/bagis tek seferlik gorev hakki, sahnelerde kamera, Amca hizli surer, PC serit cakismasi, yonetici gorev sifirlama" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_0182eo1HsbUNkb6njCHjiRWg"
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

echo.
echo ===== 5/5 Cloudflare derlemesi bekleniyor (en fazla ~8 dk) =====
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $sha=(git rev-parse HEAD).Trim(); $url='https://api.github.com/repos/cetelerinsavasi-afk/neon-sehir/commits/'+$sha+'/check-runs'; $sonuc=$null; for($i=0;$i -lt 32;$i++){ Start-Sleep -Seconds 15; try{ $r=Invoke-RestMethod -Uri $url -Headers @{'User-Agent'='neon-sehir-deploy';'Accept'='application/vnd.github+json'} }catch{ continue }; $cf=$r.check_runs | Where-Object { $_.name -like 'Workers Builds*' } | Select-Object -First 1; if(-not $cf){ Write-Host '  ...Cloudflare henuz baslamadi'; continue }; if($cf.status -ne 'completed'){ Write-Host '  ...Cloudflare derliyor'; continue }; $sonuc=$cf.conclusion; break }; Write-Host ''; if($sonuc -eq 'success'){ Write-Host 'TAMAM: v168.1 yayinda. Kontrol listesi: docs\v168-amca-senaryosu.md' -ForegroundColor Green } elseif($sonuc){ Write-Host ('Cloudflare derlemesi BASARISIZ ('+$sonuc+'). Cloudflare panelinde Workers > neon-sehir > Deployments hata kaydini Claude''a gonder.') -ForegroundColor Red } else { Write-Host 'Cloudflare 8 dk icinde derlemeyi bitirmedi. Cloudflare panelinde Workers > neon-sehir > Deployments''ta son commit icin Retry build de.' -ForegroundColor Yellow }"
goto son

:yanlis
echo Bu dosya neon-sehir proje klasorunun ICINDE olmali. HICBIR SEY YAPILMADI.

:son
echo.
pause
