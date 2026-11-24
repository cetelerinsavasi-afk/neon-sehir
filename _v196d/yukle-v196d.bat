@echo off
REM ============================================================================
REM Neon Sehir v196d (bu _v196d klasoru neon-sehir klasorunun ICINDE olmali) - ONCE v196d yuklenmis olmali.
REM v196c'nin HEPSINI icerir (v196c'yi calistirdiysan da calistirmadiysan da sadece bunu calistir).
REM  - Evden canli yayin + internet kafe yayini tam panel
REM  - Ucretli urunler tamamen kalkti (karargah dahil)
REM  - Mobilya pazari devam (envanter kisisel evde) + Profil > Mobilyalar
REM  - Hiz: mekan denetimi oturumda bir kez, kucuk resim baglami birakilir
REM  - v196c: internet kafe internal, magaza / atolye fiyatlari, Calis hatirlatmasi, ev kat dugmeleri,
REM    disarisi gorunur, tasarla modu, kat basina duvar / zemin, pencere stili, yeni kapilar
REM Firebase: fonksiyonlar. Sonra site (Cloudflare).
REM ============================================================================
setlocal
set "HERE=%~dp0"
cd /d "%HERE%.."
if not exist "package.json" goto yanlis
if not exist ".git" goto yanlis
findstr /R /C:"v196[bcd]" "src\lib\forceUpdate.js" >nul
if errorlevel 1 (
  echo Once _v196b\yukle-v196b.bat calistirilmali. HICBIR SEY YAPILMADI.
  goto son
)
set "DEGISEN=docs\v196-guncelleme.md functions\furnMarket.js functions\gang\test\fakeFirestore.js functions\home.js functions\homeGeometry.js functions\houseCatalogData.js functions\houseDoor.js functions\houses.js functions\office.js functions\officeData.js functions\scripts\stream.test.mjs functions\scripts\v196-economy.test.mjs functions\scripts\v196-home.test.mjs functions\stream.js functions\v196Shared.js functions\venue.js public\neon-flags.json src\components\City\City.css src\components\City\CityScreen.jsx src\components\City\HomePanel.css src\components\City\HomePanel.jsx src\components\City\cityEngine.js src\components\City\cityNet.js src\components\City\world\houseFloors.js src\components\City\world\outerWorld.js src\components\Furniture\FurnitureScreen.jsx src\components\HomeScreen\HomeScreen.jsx src\components\HouseScreen\HouseScreen.jsx src\components\HouseScreen\houseCatalog.js src\components\HouseScreen\itemThumbs.js src\components\Stream\CityStreamHost.jsx src\components\Stream\StreamScene.jsx src\components\Stream\StreamViewer.jsx src\components\Stream\streamShared.js src\components\Venue3D\venueGameParts.jsx src\components\Workshop\Workshop.jsx src\hooks\useOnboarding.js src\hooks\useShopOffers.js src\lib\forceUpdate.js"

echo.
echo ===== 1/6 yedek + yeni dosyalar =====
if not exist "%HERE%yedek" mkdir "%HERE%yedek"
for %%F in (%DEGISEN%) do (
  if exist "%%F" if not exist "%HERE%yedek\%%F" xcopy "%%F" "%HERE%yedek\%%F*" /Y /Q >nul
)
xcopy "%HERE%dosyalar\*" "%CD%" /E /Y /I /Q >nul
if errorlevel 1 (
  echo Dosyalar kopyalanamadi. HICBIR SEY GONDERILMEDI. Ciktiyi Claude'a gonder.
  goto son
)
echo   Dosyalar yerinde. Eski hali: _v196d\yedek

echo.
echo ===== 2/6 arayuz derleme kontrolu =====
call npm run build
if errorlevel 1 (
  echo.
  echo Arayuz derlenemedi. HICBIR SEY GONDERILMEDI. Geri almak icin geri-al-v196d.bat. Ciktiyi Claude'a gonder.
  goto son
)

echo.
echo ===== 3/6 testler =====
call npm --prefix functions test
if errorlevel 1 (
  echo.
  echo Sunucu testleri basarisiz. HICBIR SEY GONDERILMEDI. Geri almak icin geri-al-v196d.bat. Ciktiyi Claude'a gonder.
  goto son
)
node --test "tests/ui/*.test.mjs" "tests/city/*.test.mjs" "tests/cost/*.test.mjs" "tests/clock/*.test.mjs"
if errorlevel 1 (
  echo.
  echo Arayuz testleri basarisiz. HICBIR SEY GONDERILMEDI. Geri almak icin geri-al-v196d.bat. Ciktiyi Claude'a gonder.
  goto son
)

echo.
echo ===== 4/6 Firebase: fonksiyonlar (ONCE sunucu, sonra site) =====
REM Silinecek fonksiyon / indeks sorarsa N de.
set "HEDEF=functions"
call firebase deploy --only %HEDEF%
if errorlevel 1 (
  echo Ilk deneme basarisiz - 30 sn sonra bir kez daha...
  timeout /t 30 /nobreak >nul
  call firebase deploy --only %HEDEF%
  if errorlevel 1 (
    echo Firebase yuklenemedi. git push YAPILMADI ^(site degismedi^). Ciktiyi Claude'a gonder.
    goto son
  )
)

echo.
echo ===== 5/6 git commit + push (sadece v196d dosyalari) =====
set GIT_ASK_YESNO=false
git add -- docs/v196-guncelleme.md functions/furnMarket.js functions/gang/test/fakeFirestore.js functions/home.js functions/homeGeometry.js functions/houseCatalogData.js functions/houseDoor.js functions/houses.js functions/office.js functions/officeData.js functions/scripts/stream.test.mjs functions/scripts/v196-economy.test.mjs functions/scripts/v196-home.test.mjs functions/stream.js functions/v196Shared.js functions/venue.js public/neon-flags.json src/components/City/City.css src/components/City/CityScreen.jsx src/components/City/HomePanel.css src/components/City/HomePanel.jsx src/components/City/cityEngine.js src/components/City/cityNet.js src/components/City/world/houseFloors.js src/components/City/world/outerWorld.js src/components/Furniture/FurnitureScreen.jsx src/components/HomeScreen/HomeScreen.jsx src/components/HouseScreen/HouseScreen.jsx src/components/HouseScreen/houseCatalog.js src/components/HouseScreen/itemThumbs.js src/components/Stream/CityStreamHost.jsx src/components/Stream/StreamScene.jsx src/components/Stream/StreamViewer.jsx src/components/Stream/streamShared.js src/components/Venue3D/venueGameParts.jsx src/components/Workshop/Workshop.jsx src/hooks/useOnboarding.js src/hooks/useShopOffers.js src/lib/forceUpdate.js _v196d/yukle-v196d.bat _v196d/geri-al-v196d.bat
git commit -q -m "v196d: evden canli yayin, ucretli urunler tamamen kalkti, mobilya pazari ev envanteriyle, hiz + v196c (internet kafe internal, magaza fiyatlari, Calis hatirlatmasi, ev kat dugmeleri, tasarla modu, kat basina duvar / zemin, pencere stili, yeni kapilar)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_0182eo1Kgr7uUvibch1rUbXf"
if errorlevel 1 (
  echo git commit basarisiz ^(belki zaten commit edildi^). Ciktiyi Claude'a gonder.
  goto son
)
git push
if errorlevel 1 (
  echo git push basarisiz. Ciktiyi Claude'a gonder.
  goto son
)

echo.
echo ===== 6/6 Cloudflare derlemesi bekleniyor (en fazla ~8 dk) =====
echo ===== 6/6 Cloudflare derlemesi bekleniyor (en fazla ~8 dk) =====
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $sha=(git rev-parse HEAD).Trim(); $url='https://api.github.com/repos/cetelerinsavasi-afk/neon-sehir/commits/'+$sha+'/check-runs'; $sonuc=$null; for($i=0;$i -lt 32;$i++){ Start-Sleep -Seconds 15; try{ $r=Invoke-RestMethod -Uri $url -Headers @{'User-Agent'='neon-sehir-deploy';'Accept'='application/vnd.github+json'} }catch{ continue }; $cf=$r.check_runs | Where-Object { $_.name -like 'Workers Builds*' } | Select-Object -First 1; if(-not $cf){ Write-Host '  ...Cloudflare henuz baslamadi'; continue }; if($cf.status -ne 'completed'){ Write-Host '  ...Cloudflare derliyor'; continue }; $sonuc=$cf.conclusion; break }; Write-Host ''; if($sonuc -eq 'success'){ Write-Host 'TAMAM: v196d yayinda. Oyunu yenile (telefonda uygulamayi kapatip ac).' -ForegroundColor Green } elseif($sonuc){ Write-Host ('Cloudflare derlemesi BASARISIZ ('+$sonuc+'). Cloudflare panelinde Workers > neon-sehir > Deployments hata kaydini Claude''a gonder.') -ForegroundColor Red } else { Write-Host 'Cloudflare 8 dk icinde derlemeyi bitirmedi. Cloudflare panelinde Workers > neon-sehir > Deployments''ta son commit icin Retry build de.' -ForegroundColor Yellow }"
goto son

:yanlis
echo Bu _v196d klasoru neon-sehir klasorunun ICINDE olmali. HICBIR SEY YAPILMADI.

:son
echo.
pause
