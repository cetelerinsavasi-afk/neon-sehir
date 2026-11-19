@echo off
REM ============================================================================
REM Neon Sehir v167 - ACILIS HIZI + KASMA + BELEDIYE KOLTUGU + KOPRU - TEK TIK
REM   - Sehir kodu ana paketle ayni anda iner (modulepreload)
REM   - Acilis sirasi: once sehir + avatar, sonra oyuncular / altin, sonra telefon vb.
REM   - Sehir acikken ana sayfa arayuzu altta kurulmuyor (cift dinleyici yok)
REM   - Avatar dokulari kuyrukta (kalabalikta tek karede 80 resim yok)
REM   - Belediye baskan koltugu: dokununca disari yurume yok, "Otur" cikiyor
REM   - Akcay Koprusu alti acik (sadece ayaklar engel), atlar kopruye isinlanmiyor,
REM     daglar araclara engel degil
REM   - Araclar suya girer (cok yavaslar); kopru duvari / bariyer yaya ve atlara da engel
REM   - Gorevler: 1. ile 2. arasina 'Fabrikada calis' (maas alininca gecer)
REM SITE + 15 FONKSIYON (sadece gorev sirasi icin; onboardingData.js ortak).
REM firestore.rules, database.rules.json, indeksler DEGISMEZ. Okuma/yazma artmaz.
REM Geri donus: geri-al-v167.bat   Kontrol listesi: docs\v167-acilis-hizi.md
REM ============================================================================
setlocal
cd /d "%~dp0"
if not exist "package.json" goto yanlis
if not exist ".git" goto yanlis
if not exist "src\lib\bootStage.js" (
  echo v167 dosyalari bulunamadi ^(src\lib\bootStage.js yok^). Zip'i neon-sehir klasorune ac. HICBIR SEY YAPILMADI.
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
echo ===== 3/5 Firebase fonksiyonlari (gorev sirasi: v3) =====
call firebase deploy --only functions:checkOnboardingProgress,functions:completeOnboardingChecklist,functions:produceAtFactory,functions:takeVehicleLoan,functions:takeCredit,functions:prayAtMosque,functions:bribePolice,functions:buyFromVendor,functions:attemptHeist,functions:sellContrabandAtPark,functions:sendChatMessage,functions:setAvatar,functions:buyListing,functions:shopAction,functions:gangAction
if errorlevel 1 (
  echo.
  echo Fonksiyonlar yuklenemedi. git push YAPILMADI ^(site degismedi^). Biraz sonra tekrar calistir; olmazsa ciktiyi Claude'a gonder.
  goto son
)

echo.
echo ===== 4/5 git commit + push (sadece v167 dosyalari) =====
set GIT_ASK_YESNO=false
git add -- src/App.jsx src/lib/bootStage.js src/contexts/SocialContext.jsx src/components/City/CityScreen.jsx src/components/City/City.css src/components/City/cityEngine.js src/components/City/world/outerWorld.js vite.config.js src/hooks/useOnboarding.js functions/onboardingData.js functions/scripts/onboarding.test.mjs deploy-v167.bat geri-al-v167.bat docs/v167-acilis-hizi.md
git commit -q -m "v167: acilis hizi - sehir kodu erken iner, acilis sirasi, ana sayfa arayuzu sehrin altinda kurulmuyor, avatar doku kuyrugu, belediye koltugu, kopru alti acik, atlar kopruye cikmiyor, daglar engel degil, araclar suya girer, kopru duvari yaya/ata engel, gorev: fabrikada calis" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01YQymXKNkTGF94fMWnWnWgf"
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
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $sha=(git rev-parse HEAD).Trim(); $url='https://api.github.com/repos/cetelerinsavasi-afk/neon-sehir/commits/'+$sha+'/check-runs'; $sonuc=$null; for($i=0;$i -lt 32;$i++){ Start-Sleep -Seconds 15; try{ $r=Invoke-RestMethod -Uri $url -Headers @{'User-Agent'='neon-sehir-deploy';'Accept'='application/vnd.github+json'} }catch{ continue }; $cf=$r.check_runs | Where-Object { $_.name -like 'Workers Builds*' } | Select-Object -First 1; if(-not $cf){ Write-Host '  ...Cloudflare henuz baslamadi'; continue }; if($cf.status -ne 'completed'){ Write-Host '  ...Cloudflare derliyor'; continue }; $sonuc=$cf.conclusion; break }; Write-Host ''; if($sonuc -eq 'success'){ Write-Host 'TAMAM: v167 yayinda. Kontrol listesi: docs\v167-acilis-hizi.md' -ForegroundColor Green } elseif($sonuc){ Write-Host ('Cloudflare derlemesi BASARISIZ ('+$sonuc+'). Cloudflare panelinde Workers > neon-sehir > Deployments hata kaydini Claude''a gonder.') -ForegroundColor Red } else { Write-Host 'Cloudflare 8 dk icinde derlemeyi bitirmedi. Cloudflare panelinde Workers > neon-sehir > Deployments''ta son commit icin Retry build de.' -ForegroundColor Yellow }"
goto son

:yanlis
echo Bu dosya neon-sehir proje klasorunun ICINDE olmali. HICBIR SEY YAPILMADI.

:son
echo.
pause
