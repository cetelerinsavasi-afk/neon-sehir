@echo off
REM ============================================================================
REM Neon Sehir v166 - AKICILIK + GALERI FIYATI + AT DUZELTMELERI - TEK TIK
REM   - Atin fari kaldirildi
REM   - Oyunun galerisi / silahcisi, alicinin KENDI dukkanini gostermez (en ucuz digeri)
REM   - Acilista ekranlar artik calistirilmiyor, sadece indiriliyor (kasma + bellek)
REM   - Surerken hiz gostergesi butun sehir ekranini yeniden cizmiyor
REM   - Soygun videosu baslamadan once de "Gec" + acilis karti kisa
REM   - 2. elde at / bisiklet / motor / ticari ilan fiyat araligi sunucuyla ayni
REM SADECE SITE. Firebase fonksiyonlari, firestore.rules, database.rules.json,
REM indeksler DEGISMEZ. Firestore okuma/yazma artmaz.
REM Geri donus: geri-al-v166.bat   Kontrol listesi: docs\v166-akicilik.md
REM ============================================================================
setlocal
cd /d "%~dp0"
if not exist "package.json" goto yanlis
if not exist ".git" goto yanlis
if not exist "src\lib\myShops.js" (
  echo v166 dosyalari bulunamadi ^(src\lib\myShops.js yok^). Zip'i neon-sehir klasorune ac. HICBIR SEY YAPILMADI.
  goto son
)

echo.
echo ===== 1/4 arayuz derleme kontrolu =====
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
echo ===== 2/4 testler =====
set "TESTLER="
for %%T in ("tests\webview\webview.test.mjs" "tests\city\jobs-resume.test.mjs" "tests\city\kurye.test.mjs" "tests\city\nav-route.test.mjs" "tests\clock\clock-sync.test.mjs" "tests\clock\server-clock.test.mjs" "tests\cost\daily-gate.test.mjs" "tests\cost\fs-meter.test.mjs" "tests\cost\fs-shim-off.test.mjs" "tests\cost\fs-shim-on.test.mjs") do (
  if exist "%%~T" call set "TESTLER=%%TESTLER%% %%~T"
)
node --test %TESTLER%
if errorlevel 1 (
  echo.
  echo Testler basarisiz. HICBIR SEY GONDERILMEDI. Ciktiyi Claude'a gonder.
  goto son
)

echo.
echo ===== 3/4 git commit + push (sadece v166 dosyalari) =====
set GIT_ASK_YESNO=false
git add -- src/App.jsx src/components/City/CityScreen.jsx src/components/City/HeistVideo.jsx src/components/City/cityEngine.js src/components/City/cityHeist.css src/components/City/cityHeist.js src/components/HeistPanel/HeistPanel.jsx src/components/MarketplaceScreen/MarketplaceScreen.jsx src/components/VehicleGalleryScreen/VehicleGalleryScreen.jsx src/components/WeaponShopScreen/WeaponShopScreen.jsx src/hooks/useBizReminders.js src/hooks/useShopOffers.js src/lib/myShops.js vite.config.js deploy-v166.bat geri-al-v166.bat docs/v166-akicilik.md
git commit -q -m "v166: akicilik - at fari yok, oyunun galerisi/silahcisi kendi dukkanini gostermiyor, ekranlar acilista calistirilmiyor (sadece indiriliyor), hiz gostergesi ayri, soygun videosu once Gec, 2. elde at fiyat araligi sunucuyla ayni" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_0182eo1JYP78aa2ii1vBKJ83"
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
echo ===== 4/4 Cloudflare derlemesi bekleniyor (en fazla ~8 dk) =====
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $sha=(git rev-parse HEAD).Trim(); $url='https://api.github.com/repos/cetelerinsavasi-afk/neon-sehir/commits/'+$sha+'/check-runs'; $sonuc=$null; for($i=0;$i -lt 32;$i++){ Start-Sleep -Seconds 15; try{ $r=Invoke-RestMethod -Uri $url -Headers @{'User-Agent'='neon-sehir-deploy';'Accept'='application/vnd.github+json'} }catch{ continue }; $cf=$r.check_runs | Where-Object { $_.name -like 'Workers Builds*' } | Select-Object -First 1; if(-not $cf){ Write-Host '  ...Cloudflare henuz baslamadi'; continue }; if($cf.status -ne 'completed'){ Write-Host '  ...Cloudflare derliyor'; continue }; $sonuc=$cf.conclusion; break }; Write-Host ''; if($sonuc -eq 'success'){ Write-Host 'TAMAM: v166 yayinda. Kontrol listesi: docs\v166-akicilik.md' -ForegroundColor Green } elseif($sonuc){ Write-Host ('Cloudflare derlemesi BASARISIZ ('+$sonuc+'). Cloudflare panelinde Workers > neon-sehir > Deployments hata kaydini Claude''a gonder.') -ForegroundColor Red } else { Write-Host 'Cloudflare 8 dk icinde derlemeyi bitirmedi. Cloudflare panelinde Workers > neon-sehir > Deployments''ta son commit icin Retry build de.' -ForegroundColor Yellow }"
goto son

:yanlis
echo Bu dosya neon-sehir proje klasorunun ICINDE olmali. HICBIR SEY YAPILMADI.

:son
echo.
pause
