@echo off
REM ============================================================================
REM Neon Sehir v196e (bu _v196e klasoru neon-sehir klasorunun ICINDE olmali) - ONCE v196d yuklenmis olmali (yuklu).
REM  - Ev tasarimi = eski karargah tasarim ekrani (Magaza / Envanter / Pazar, Sepet, deneme esya yari saydam)
REM  - Surukle-birak duzeldi, oyun evin icinde acilir, Evler dugmesi blogun her yaninda
REM  - Favori arac profilden (kalp), garaj kapisi 10 m'den acilir
REM  - Cafe / bar 10.000 siniri kalkti, Riza Amca seridi kisa gorunur, motor galerisi yurunur
REM Firebase: fonksiyonlar. Sonra site (Cloudflare).
REM ============================================================================
setlocal
set "HERE=%~dp0"
cd /d "%HERE%.."
if not exist "package.json" goto yanlis
if not exist ".git" goto yanlis
findstr /R /C:"v196[de]" "src\lib\forceUpdate.js" >nul
if errorlevel 1 (
  echo Once _v196d\yukle-v196d.bat calistirilmali. HICBIR SEY YAPILMADI.
  goto son
)
set "DEGISEN=docs\v196-guncelleme.md functions\home.js functions\scripts\v196-economy.test.mjs functions\scripts\v196-home.test.mjs functions\venue.js public\neon-flags.json src\components\City\CityScreen.jsx src\components\City\HomePanel.css src\components\City\HomePanel.jsx src\components\City\buildings.js src\components\City\cityEngine.js src\components\City\story\AmcaStory.jsx src\components\City\world\houseFloors.js src\components\City\world\outerWorld.js src\components\City\world\venues.js src\components\HomeScreen\HomeScreen.jsx src\components\VehicleCard\VehicleCard.css src\components\VehicleCard\VehicleCard.jsx src\components\Venue\MenuPanel.jsx src\lib\forceUpdate.js"

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
echo   Dosyalar yerinde. Eski hali: _v196e\yedek

echo.
echo ===== 2/6 arayuz derleme kontrolu =====
call npm run build
if errorlevel 1 (
  echo.
  echo Arayuz derlenemedi. HICBIR SEY GONDERILMEDI. Geri almak icin geri-al-v196e.bat. Ciktiyi Claude'a gonder.
  goto son
)

echo.
echo ===== 3/6 testler =====
call npm --prefix functions test
if errorlevel 1 (
  echo.
  echo Sunucu testleri basarisiz. HICBIR SEY GONDERILMEDI. Geri almak icin geri-al-v196e.bat. Ciktiyi Claude'a gonder.
  goto son
)
node --test "tests/ui/*.test.mjs" "tests/city/*.test.mjs" "tests/cost/*.test.mjs" "tests/clock/*.test.mjs"
if errorlevel 1 (
  echo.
  echo Arayuz testleri basarisiz. HICBIR SEY GONDERILMEDI. Geri almak icin geri-al-v196e.bat. Ciktiyi Claude'a gonder.
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
echo ===== 5/6 git commit + push (sadece v196e dosyalari) =====
set GIT_ASK_YESNO=false
git add -- docs/v196-guncelleme.md functions/home.js functions/scripts/v196-economy.test.mjs functions/scripts/v196-home.test.mjs functions/venue.js public/neon-flags.json src/components/City/CityScreen.jsx src/components/City/HomePanel.css src/components/City/HomePanel.jsx src/components/City/buildings.js src/components/City/cityEngine.js src/components/City/story/AmcaStory.jsx src/components/City/world/houseFloors.js src/components/City/world/outerWorld.js src/components/City/world/venues.js src/components/HomeScreen/HomeScreen.jsx src/components/VehicleCard/VehicleCard.css src/components/VehicleCard/VehicleCard.jsx src/components/Venue/MenuPanel.jsx src/lib/forceUpdate.js _v196e/yukle-v196e.bat _v196e/geri-al-v196e.bat
git commit -q -m "v196e: ev tasarimi eski (karargah) tasarim ekraniyla ayni, surukle-birak duzeldi, oyun evin icinde acilir, Evler dugmesi blogun her yaninda, favori arac profilden (kalp), cafe/bar 10.000 siniri kalkti, Riza Amca seridi kisa gorunur, motor galerisi yurunur" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_0182eo1Kgr7uUvibch1rUbXf"
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
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $sha=(git rev-parse HEAD).Trim(); $url='https://api.github.com/repos/cetelerinsavasi-afk/neon-sehir/commits/'+$sha+'/check-runs'; $sonuc=$null; for($i=0;$i -lt 32;$i++){ Start-Sleep -Seconds 15; try{ $r=Invoke-RestMethod -Uri $url -Headers @{'User-Agent'='neon-sehir-deploy';'Accept'='application/vnd.github+json'} }catch{ continue }; $cf=$r.check_runs | Where-Object { $_.name -like 'Workers Builds*' } | Select-Object -First 1; if(-not $cf){ Write-Host '  ...Cloudflare henuz baslamadi'; continue }; if($cf.status -ne 'completed'){ Write-Host '  ...Cloudflare derliyor'; continue }; $sonuc=$cf.conclusion; break }; Write-Host ''; if($sonuc -eq 'success'){ Write-Host 'TAMAM: v196e yayinda. Oyunu yenile (telefonda uygulamayi kapatip ac).' -ForegroundColor Green } elseif($sonuc){ Write-Host ('Cloudflare derlemesi BASARISIZ ('+$sonuc+'). Cloudflare panelinde Workers > neon-sehir > Deployments hata kaydini Claude''a gonder.') -ForegroundColor Red } else { Write-Host 'Cloudflare 8 dk icinde derlemeyi bitirmedi. Cloudflare panelinde Workers > neon-sehir > Deployments''ta son commit icin Retry build de.' -ForegroundColor Yellow }"
goto son

:yanlis
echo Bu _v196e klasoru neon-sehir klasorunun ICINDE olmali. HICBIR SEY YAPILMADI.

:son
echo.
pause
