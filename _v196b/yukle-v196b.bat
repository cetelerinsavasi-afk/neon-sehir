@echo off
REM ============================================================================
REM Neon Sehir v196b - DUZELTMELER (bu _v196b klasoru neon-sehir klasorunun ICINDE olmali)
REM v196a'yi da icerir (calistirmadiysan sorun yok, bu yeter).
REM  - Ev: ici aydinlik, kapidan ic gorunur, garajda arac, oyuna evde dogma, Ayarlar ust panelde
REM  - Mustakil evlerde "Evler", kamelyaya 4 kisi, internet kafe (Oyun oyna / Yayin ac)
REM  - Bar + silahci cam, bahcede siparis, garsonlar, mekan dugmeleri solda, borsa mekan resimleri
REM  - Motor galerisi, modifiye kapisi, karargah garaj kapisi, fabrika ekrani, futbol antrenmani 1.000
REM  - Bar / cafe / camii / taksi duragi yer degisimi, Isletme uygulamasi kalkti
REM Firebase: fonksiyonlar + indeksler. Sonra site (Cloudflare).
REM ============================================================================
setlocal
set "HERE=%~dp0"
cd /d "%HERE%.."
if not exist "package.json" goto yanlis
if not exist ".git" goto yanlis
if not exist "functions\v196Migration.js" (
  echo Once v196 yuklenmeli. HICBIR SEY YAPILMADI.
  goto son
)
set "DEGISEN=firestore.indexes.json functions\cityJobsData.js functions\home.js functions\houses.js functions\index.js functions\scripts\v196-home.test.mjs functions\scripts\v196-migration.test.mjs functions\v196Closing.js functions\v196Migration.js functions\v196Shared.js public\neon-flags.json src\App.jsx src\components\City\City.css src\components\City\CityScreen.jsx src\components\City\HomePanel.css src\components\City\HomePanel.jsx src\components\City\buildings.js src\components\City\cityEngine.js src\components\City\cityLayout.js src\components\City\cityMapMath.js src\components\City\kit.js src\components\City\world\layouts.js src\components\City\world\newItems.js src\components\City\world\outerWorld.js src\components\City\world\venues.js src\components\FactoryScreen\FactoryScreen.css src\components\FactoryScreen\FactoryScreen.jsx src\components\FutbolScreen\FutbolAltyapi.jsx src\components\HouseScreen\HouseScreen.jsx src\components\Phone\PhoneScreen.jsx src\components\Phone\borsa\BorsaApp.jsx src\components\Phone\borsa\vendorArt.jsx src\components\Phone\cappstoreApps.js src\components\Venue3D\venueGameParts.jsx src\components\Venue3D\venueParts.jsx src\lib\forceUpdate.js"

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
echo   Dosyalar yerinde. Eski hali: _v196b\yedek

echo.
echo ===== 2/6 arayuz derleme kontrolu =====
call npm run build
if errorlevel 1 (
  echo.
  echo Arayuz derlenemedi. HICBIR SEY GONDERILMEDI. Geri almak icin geri-al-v196b.bat. Ciktiyi Claude'a gonder.
  goto son
)

echo.
echo ===== 3/6 testler =====
call npm --prefix functions test
if errorlevel 1 (
  echo.
  echo Sunucu testleri basarisiz. HICBIR SEY GONDERILMEDI. Geri almak icin geri-al-v196b.bat. Ciktiyi Claude'a gonder.
  goto son
)
node --test "tests/ui/*.test.mjs" "tests/city/*.test.mjs" "tests/cost/*.test.mjs" "tests/clock/*.test.mjs"
if errorlevel 1 (
  echo.
  echo Arayuz testleri basarisiz. HICBIR SEY GONDERILMEDI. Geri almak icin geri-al-v196b.bat. Ciktiyi Claude'a gonder.
  goto son
)

echo.
echo ===== 4/6 Firebase: fonksiyonlar + indeksler (ONCE sunucu, sonra site) =====
REM Silinecek fonksiyon / indeks sorarsa N de.
set "HEDEF=functions,firestore:indexes"
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
echo   hediye hisse onarimi (bir kez; tekrar calismasi zararsiz):
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; try { $r = Invoke-RestMethod -TimeoutSec 600 -Uri 'https://europe-west1-neon-sehir.cloudfunctions.net/runV196MigrationNow?secret=854f8bf3de15bf540bd36a26a3cce7e5&op=fixGift'; Write-Host ('  Onarim: ' + ($r | ConvertTo-Json -Compress)) -ForegroundColor Green } catch { Write-Host ('  Onarim calismadi: ' + $_.Exception.Message) -ForegroundColor Yellow }"

echo.
echo ===== 5/6 git commit + push (sadece v196b dosyalari) =====
set GIT_ASK_YESNO=false
git add -- firestore.indexes.json functions/cityJobsData.js functions/home.js functions/houses.js functions/index.js functions/scripts/v196-home.test.mjs functions/scripts/v196-migration.test.mjs functions/v196Closing.js functions/v196Migration.js functions/v196Shared.js public/neon-flags.json src/App.jsx src/components/City/City.css src/components/City/CityScreen.jsx src/components/City/HomePanel.css src/components/City/HomePanel.jsx src/components/City/buildings.js src/components/City/cityEngine.js src/components/City/cityLayout.js src/components/City/cityMapMath.js src/components/City/kit.js src/components/City/world/layouts.js src/components/City/world/newItems.js src/components/City/world/outerWorld.js src/components/City/world/venues.js src/components/FactoryScreen/FactoryScreen.css src/components/FactoryScreen/FactoryScreen.jsx src/components/FutbolScreen/FutbolAltyapi.jsx src/components/HouseScreen/HouseScreen.jsx src/components/Phone/PhoneScreen.jsx src/components/Phone/borsa/BorsaApp.jsx src/components/Phone/borsa/vendorArt.jsx src/components/Phone/cappstoreApps.js src/components/Venue3D/venueGameParts.jsx src/components/Venue3D/venueParts.jsx src/lib/forceUpdate.js _v196b/yukle-v196b.bat _v196b/geri-al-v196b.bat
git commit -q -m "v196b: ev ici aydinlik, garaj araci, evde dogma, Ayarlar ust panelde, Mustakil Evler, kamelya 4 kisi, internet kafe (Oyun oyna / Yayin ac), bar+silahci cam, bahcede siparis, garsonlar, dugmeler solda, borsa mekan resimleri, motor galerisi, karargah garaj kapisi, fabrika ekrani, futbol antrenmani 1.000, mekan yer degisimi" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_0182eo1Kgr7uUvibch1rUbXf"
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
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $sha=(git rev-parse HEAD).Trim(); $url='https://api.github.com/repos/cetelerinsavasi-afk/neon-sehir/commits/'+$sha+'/check-runs'; $sonuc=$null; for($i=0;$i -lt 32;$i++){ Start-Sleep -Seconds 15; try{ $r=Invoke-RestMethod -Uri $url -Headers @{'User-Agent'='neon-sehir-deploy';'Accept'='application/vnd.github+json'} }catch{ continue }; $cf=$r.check_runs | Where-Object { $_.name -like 'Workers Builds*' } | Select-Object -First 1; if(-not $cf){ Write-Host '  ...Cloudflare henuz baslamadi'; continue }; if($cf.status -ne 'completed'){ Write-Host '  ...Cloudflare derliyor'; continue }; $sonuc=$cf.conclusion; break }; Write-Host ''; if($sonuc -eq 'success'){ Write-Host 'TAMAM: v196b yayinda. Oyunu yenile (telefonda uygulamayi kapatip ac).' -ForegroundColor Green } elseif($sonuc){ Write-Host ('Cloudflare derlemesi BASARISIZ ('+$sonuc+'). Cloudflare panelinde Workers > neon-sehir > Deployments hata kaydini Claude''a gonder.') -ForegroundColor Red } else { Write-Host 'Cloudflare 8 dk icinde derlemeyi bitirmedi. Cloudflare panelinde Workers > neon-sehir > Deployments''ta son commit icin Retry build de.' -ForegroundColor Yellow }"
goto son

:yanlis
echo Bu _v196b klasoru neon-sehir klasorunun ICINDE olmali. HICBIR SEY YAPILMADI.

:son
echo.
pause
