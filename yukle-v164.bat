@echo off
REM ============================================================================
REM Neon Sehir v164 - TEK TIK: derler, test eder, commit + push eder
REM (Cloudflare siteyi kendisi derler) ve derlemenin sonucunu bekler.
REM   - Avatarlarin ARKA gorunusu yeniden cizildi: arabada / tribunde / kameradan
REM     uzaklasarak yururken sirt gorunur (kravat, yaka, fermuar, rozet artik bize donuk degil;
REM     kiyafetin sirti, sacin arkasi, sapka / kask / kapusonun arkasi cizilir)
REM   - Kostumlerde ve kaskli / maskeli tiplerde arkadan "kel" gorunme duzeltildi
REM   - Pelerin / kanat arkadan bakinca govdenin ustunde
REM   - Ev ve mekan iclerinde de uzaklasirken sirt gorunur
REM   - Mini harita + buyuk harita: yakindaki oyuncular nokta olarak (ek okuma yok)
REM   - "Sampiyonaya katil" hatirlatmasi motor / ticari aracta artik cikmiyor
REM   - "Mac basladi" hatirlatmasi (mac gunleri 18-19, stadyum disinda; Git: stadyum)
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
git add -- src/lib/avatarShapes.js src/components/City/cityEngine.js src/components/HouseScreen/houseEngine.js src/components/City/CityScreen.jsx src/components/City/City.css src/components/City/world/map.js src/hooks/useOnboarding.js src/hooks/useMatchLive.js src/components/OnboardingPanel/OnboardingPanel.jsx yukle-v164.bat
REM v163 duzeltme commit'i calismadiysa onun dosyalari da gider (zaten gonderildiyse degisiklik yok)
git add -- functions/index.js functions/vehicleMods.js public/_headers public/sw.js src/assets/sehir-haritasi.webp src/components/City/sound.js src/components/City/vehicles.js src/components/City/world/roadside.js src/components/CityMap/CityMap.jsx src/components/Phone/CappstoreScreen.jsx src/components/Phone/PhoneScreen.jsx src/components/Phone/cappstoreApps.js src/components/RegionModal/RegionModal.jsx src/components/Sixtagram/PostAttachment.jsx src/components/Workshop/ModifiyeStudio.css src/components/Workshop/ModifiyeStudio.jsx src/lib/hornSound.js 2>nul
git commit -q -m "v164: avatar arka gorunusu (kiyafet sirti, sac / sapka / kask arkasi, kostum basliklari siluet; arabada, tribunde ve uzaklasarak yururken; ev ve mekan iclerinde de), kostumlerde arkadan kel gorunme duzeltildi; haritada yakindaki oyuncular; sampiyona hatirlatmasi sadece arabalar; mac basladi hatirlatmasi (18-19, stadyum disi)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01YQymXPB7KvQ27BGAQhn9PE"
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
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $sha=(git rev-parse HEAD).Trim(); $url='https://api.github.com/repos/cetelerinsavasi-afk/neon-sehir/commits/'+$sha+'/check-runs'; $sonuc=$null; for($i=0;$i -lt 32;$i++){ Start-Sleep -Seconds 15; try{ $r=Invoke-RestMethod -Uri $url -Headers @{'User-Agent'='neon-sehir-deploy';'Accept'='application/vnd.github+json'} }catch{ continue }; $cf=$r.check_runs | Where-Object { $_.name -like 'Workers Builds*' } | Select-Object -First 1; if(-not $cf){ Write-Host '  ...Cloudflare henuz baslamadi'; continue }; if($cf.status -ne 'completed'){ Write-Host '  ...Cloudflare derliyor'; continue }; $sonuc=$cf.conclusion; break }; Write-Host ''; if($sonuc -eq 'success'){ Write-Host 'TAMAM: v164 yayinda. Oyunu yenile (bilgisayarda Ctrl+F5, telefonda uygulamayi kapatip ac).' -ForegroundColor Green } elseif($sonuc){ Write-Host ('Cloudflare derlemesi BASARISIZ ('+$sonuc+'). Cloudflare panelinde Workers > neon-sehir > Deployments hata kaydini Claude''a gonder.') -ForegroundColor Red } else { Write-Host 'Cloudflare 8 dk icinde derlemeyi bitirmedi. Cloudflare panelinde Workers > neon-sehir > Deployments''ta son commit icin Retry build de.' -ForegroundColor Yellow }"
goto son

:yanlis
echo Bu dosya neon-sehir proje klasorunun ICINDE olmali. HICBIR SEY YAPILMADI.

:son
echo.
pause
