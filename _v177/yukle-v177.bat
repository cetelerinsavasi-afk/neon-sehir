@echo off
REM ============================================================================
REM Neon Sehir v177 - TEK TIK (bu _v177 klasoru neon-sehir klasorunun ICINDE olmali)
REM  1) Degisecek dosyalarin yedegi: _v177\yedek
REM  2) _v177\dosyalar icindekiler eskilerinin yerine kopyalanir
REM  3) Derleme + testler
REM  4) Firebase fonksiyonlari
REM  5) git commit + push (SADECE v177 dosyalari) ve Cloudflare beklenir
REM Yenilikler:
REM  1 TICARI ARACLAR: galeride satilmaz. Taksi Duragi (Taksi), Otogarlar (Otobus),
REM    Hastane (Ambulans), liman yukleme / teslimat depolari (Tir). Her turden 1 arac
REM    (2. elden de). Polis arabasi kalkti (meslek duruyor). Soforluk Gelir Vergisi
REM    (yuzde 10, 1-20) + yuzde 10 sirket payi (kurye haric). Is basi: tir 6.000,
REM    otobus 12.500, taksi 1.500, ambulans 3.500. Neon Borsa'ya 4 sirket.
REM  2 MOTOR GALERISI: yeni isletme turu (4 motor esyasi). Oyunun motor galerisi
REM    camiinin arkasinda, camli showroom. Araba galerisi artik sadece araba satar.
REM  3 2. EL: araba / ticari / motor sekmeleri; ticari ve motorda sadece omur.
REM    Bisiklet, at, deve 2. elde satilmaz.
REM  4 DEVE + COL: Golyaka cevresi col; Golyaka'da deveci (deve 50.000, 2 kisilik),
REM    Camlica'da at ahiri (75.000). Renk satin alirken secilir, modifiye yok.
REM  5 BISIKLETCI: kuzey parkin x=100 kapisinda. Bisiklet satin al (7.500, renkli)
REM    ya da kirala (dakikasi 100). Binikken sure uzar, inikken dolarsa bisiklet kaybolur.
REM  TEK SEFERLIK GECIS (yuklemeden sonraki ilk xx:20): polis arabalari ve ayni turden
REM    fazla ticari araclar kalan omre gore odenerek kaldirilir; galerilerdeki ticari /
REM    motor / bisiklet / at stogunun odenen bedeli iade edilir; acik bisiklet / at
REM    ilanlari kapanir (arac sahibine doner). Hepsine SMS.
REM Firestore: gecis bir kez calisir, sonra saatte 1 okuma. Kiralik bisiklet dakikada 1 yazma.
REM Geri donus: _v177\geri-al-v177.bat
REM ============================================================================
setlocal
set "HERE=%~dp0"
cd /d "%HERE%.."
if not exist "package.json" goto yanlis
if not exist ".git" goto yanlis
if not exist "%HERE%dosyalar\functions\fleet.js" (
  echo _v177\dosyalar eksik. HICBIR SEY YAPILMADI.
  goto son
)

echo.
echo ===== 1/6 yedek + yeni dosyalar =====
for %%F in (functions\belediyeRates.js functions\borsa.js functions\business.js functions\businessCatalogData.js functions\catalogData.js functions\fleet.js functions\gang\actions\trade.js functions\gang\core.js functions\index.js functions\jobs.js functions\scripts\borsa.test.mjs functions\scripts\business.test.mjs functions\scripts\fleet.test.mjs functions\scripts\shop.test.mjs functions\shop.js functions\shopStockRules.js functions\stable.js functions\stateTreasury.js functions\tax.js functions\vehicleKinds.js functions\vehicleMods.js preview\borsa-app.jsx preview\fleet-app.jsx preview\fleet.html preview\market-app.jsx preview\market.html preview\mocks\backend.js src\App.jsx src\components\Belediye\Defter.jsx src\components\BusinessHub\BusinessHub.jsx src\components\City\City.css src\components\City\CityScreen.jsx src\components\City\buildings.js src\components\City\cityEngine.js src\components\City\cityJobs.js src\components\City\cityLayout.js src\components\City\cityPlan.js src\components\City\vehicles.js src\components\City\world\animals.js src\components\City\world\map.js src\components\City\world\northPark.js src\components\City\world\outerWorld.js src\components\City\world\roadside.js src\components\City\world\roadsideGeo.js src\components\City\world\route.js src\components\City\world\world.js src\components\HouseScreen\HouseBusiness.jsx src\components\HouseScreen\HouseScreen.jsx src\components\MarketplaceScreen\MarketplaceScreen.css src\components\MarketplaceScreen\MarketplaceScreen.jsx src\components\MotorGallery\MotorGalleryScreen.css src\components\MotorGallery\MotorGalleryScreen.jsx src\components\Phone\borsa\BorsaApp.jsx src\components\Phone\borsa\vendorArt.jsx src\components\Shop\ShopOwnerPanels.jsx src\components\Shop\ShopShowcase.jsx src\components\VehicleGalleryScreen\VehicleGalleryScreen.jsx src\components\Workshop\Workshop.jsx src\data\vehicleCatalog.js src\hooks\useBizReminders.js src\lib\moneySources.js) do (
  if exist "%%F" if not exist "%HERE%yedek\%%F" xcopy "%%F" "%HERE%yedek\%%F*" /Y /Q >nul
)
xcopy "%HERE%dosyalar\*" "%CD%" /E /Y /I /Q >nul
if errorlevel 1 (
  echo Dosyalar kopyalanamadi. HICBIR SEY GONDERILMEDI. Ciktiyi Claude'a gonder.
  goto son
)
echo   Dosyalar yerinde. Eski hali: _v177\yedek

echo.
echo ===== 2/6 arayuz derleme kontrolu =====
call npm run build
if errorlevel 1 (
  echo.
  echo Arayuz derlenemedi. HICBIR SEY GONDERILMEDI. Geri almak icin geri-al-v177.bat. Ciktiyi Claude'a gonder.
  goto son
)

echo.
echo ===== 3/6 testler =====
set "TESTLER="
for %%Q in ("functions\scripts\fleet.test.mjs" "functions\scripts\shop.test.mjs" "functions\scripts\business.test.mjs" "functions\scripts\borsa.test.mjs" "functions\scripts\v145.test.mjs" "tests\webview\webview.test.mjs" "tests\city\jobs-resume.test.mjs" "tests\city\kurye.test.mjs" "tests\city\nav-route.test.mjs" "tests\clock\clock-sync.test.mjs" "tests\clock\server-clock.test.mjs" "tests\cost\daily-gate.test.mjs") do (
  if exist "%%~Q" call set "TESTLER=%%TESTLER%% %%~Q"
)
node --test %TESTLER%
if errorlevel 1 (
  echo.
  echo Testler basarisiz. HICBIR SEY GONDERILMEDI. Ciktiyi Claude'a gonder.
  goto son
)

echo.
echo ===== 4/6 Firebase fonksiyonlari =====
set "FN=functions:shopAction,functions:houseAction,functions:buyVehicle,functions:createListing,functions:instantSellListing,functions:buyListing,functions:borsaAction,functions:cronTick,functions:belediyeAction,functions:dailyReset,functions:dailyResetRecovery,functions:gangAction,functions:adminAccountDeletion"
call firebase deploy --only %FN%
if errorlevel 1 (
  echo.
  echo Ilk deneme basarisiz - 20 sn sonra bir kez daha deneniyor...
  timeout /t 20 /nobreak >nul
  call firebase deploy --only %FN%
  if errorlevel 1 (
    echo.
    echo Firebase yuklenemedi. git push YAPILMADI ^(site degismedi^). Bu dosyayi tekrar calistir; olmazsa ciktiyi Claude'a gonder.
    goto son
  )
)

echo.
echo ===== 5/6 git commit + push (sadece v177 dosyalari) =====
set GIT_ASK_YESNO=false
git add -- functions/belediyeRates.js functions/borsa.js functions/business.js functions/businessCatalogData.js functions/catalogData.js functions/fleet.js functions/gang/actions/trade.js functions/gang/core.js functions/index.js functions/jobs.js functions/scripts/borsa.test.mjs functions/scripts/business.test.mjs functions/scripts/fleet.test.mjs functions/scripts/shop.test.mjs functions/shop.js functions/shopStockRules.js functions/stable.js functions/stateTreasury.js functions/tax.js functions/vehicleKinds.js functions/vehicleMods.js preview/borsa-app.jsx preview/fleet-app.jsx preview/fleet.html preview/market-app.jsx preview/market.html preview/mocks/backend.js src/App.jsx src/components/Belediye/Defter.jsx src/components/BusinessHub/BusinessHub.jsx src/components/City/City.css src/components/City/CityScreen.jsx src/components/City/buildings.js src/components/City/cityEngine.js src/components/City/cityJobs.js src/components/City/cityLayout.js src/components/City/cityPlan.js src/components/City/vehicles.js src/components/City/world/animals.js src/components/City/world/map.js src/components/City/world/northPark.js src/components/City/world/outerWorld.js src/components/City/world/roadside.js src/components/City/world/roadsideGeo.js src/components/City/world/route.js src/components/City/world/world.js src/components/HouseScreen/HouseBusiness.jsx src/components/HouseScreen/HouseScreen.jsx src/components/MarketplaceScreen/MarketplaceScreen.css src/components/MarketplaceScreen/MarketplaceScreen.jsx src/components/MotorGallery/MotorGalleryScreen.css src/components/MotorGallery/MotorGalleryScreen.jsx src/components/Phone/borsa/BorsaApp.jsx src/components/Phone/borsa/vendorArt.jsx src/components/Shop/ShopOwnerPanels.jsx src/components/Shop/ShopShowcase.jsx src/components/VehicleGalleryScreen/VehicleGalleryScreen.jsx src/components/Workshop/Workshop.jsx src/data/vehicleCatalog.js src/hooks/useBizReminders.js src/lib/moneySources.js _v177/yukle-v177.bat _v177/geri-al-v177.bat
git commit -q -m "v177: ticari araclar (durak/otogar/hastane/yukleme), motor galerisi, 2. el sekmeleri, deve + col + koy ahirlari, bisikletci (satis + kiralama)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_0182eo1GNYTHCsRAPyPWVtdZ"
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
echo ===== 6/6 Cloudflare derlemesi bekleniyor (en fazla ~8 dk) =====
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $sha=(git rev-parse HEAD).Trim(); $url='https://api.github.com/repos/cetelerinsavasi-afk/neon-sehir/commits/'+$sha+'/check-runs'; $sonuc=$null; for($i=0;$i -lt 32;$i++){ Start-Sleep -Seconds 15; try{ $r=Invoke-RestMethod -Uri $url -Headers @{'User-Agent'='neon-sehir-deploy';'Accept'='application/vnd.github+json'} }catch{ continue }; $cf=$r.check_runs | Where-Object { $_.name -like 'Workers Builds*' } | Select-Object -First 1; if(-not $cf){ Write-Host '  ...Cloudflare henuz baslamadi'; continue }; if($cf.status -ne 'completed'){ Write-Host '  ...Cloudflare derliyor'; continue }; $sonuc=$cf.conclusion; break }; Write-Host ''; if($sonuc -eq 'success'){ Write-Host 'TAMAM: v177 yayinda. Oyunu yenile (telefonda uygulamayi kapatip ac). Eski araclarin gecisi ilk xx:20de yapilir.' -ForegroundColor Green } elseif($sonuc){ Write-Host ('Cloudflare derlemesi BASARISIZ ('+$sonuc+'). Cloudflare panelinde Workers > neon-sehir > Deployments hata kaydini Claude''a gonder.') -ForegroundColor Red } else { Write-Host 'Cloudflare 8 dk icinde derlemeyi bitirmedi. Cloudflare panelinde Workers > neon-sehir > Deployments''ta son commit icin Retry build de.' -ForegroundColor Yellow }"
goto son

:yanlis
echo Bu _v177 klasoru neon-sehir klasorunun ICINDE olmali. HICBIR SEY YAPILMADI.

:son
echo.
pause
