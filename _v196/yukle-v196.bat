@echo off
REM ============================================================================
REM Neon Sehir v196 - TAM SURUM (bu _v196 klasoru neon-sehir klasorunun ICINDE olmali)
REM ONCE: asama1\yukle-v196-asama1.bat + gecis-v196.bat (Yedek, Kapat, Deneme) + Claude'un onayi.
REM  - Oyuncu evleri / ofisleri / isletmeleri kapandi, mekanlar oyunun (gelir: masraf + vergi + hissedar)
REM  - 8 mekan hissesi, 5 yeni mekan, fabrika Calis (5.000/gun), elmas makinesi, 3 katli ev
REM  - Cete ticareti otomatik satis, hisse senedi yatirimi kalkti, yeni oyuncu 5.000 (referans 10.000)
REM Firebase: TUM fonksiyonlar + Firestore indeksleri. Kurallar DEGISMEDI.
REM Sonra: gecis-v196.bat -> 5 Uygula (rapor kimligi), 6 Durum. Ayrinti: docs\v196-guncelleme.md
REM ============================================================================
setlocal
set "HERE=%~dp0"
cd /d "%HERE%.."
if not exist "package.json" goto yanlis
if not exist ".git" goto yanlis
if not exist "functions\v196Migration.js" (
  echo Once asama1\yukle-v196-asama1.bat calistirilmali. HICBIR SEY YAPILMADI.
  goto son
)
if not exist "%HERE%dosyalar\functions\home.js" (
  echo _v196\dosyalar eksik. HICBIR SEY YAPILMADI.
  goto son
)
echo Deneme (dryRun) yapildi ve Claude onay verdi mi?
choice /c EH /m "Devam (E = evet, H = hayir)"
if errorlevel 2 goto son

echo.
echo ===== 1/6 yedek + yeni dosyalar =====
set "DEGISEN=firestore.indexes.json functions\belediyeGazete.js functions\belediyeRates.js functions\borsa.js functions\business.js functions\casinoRules.js functions\championshipPrizes.js functions\cityJobsData.js functions\cosmeticsData.js functions\depo.js functions\gang\actions\market.js functions\gang\actions\trade.js functions\gang\actions\wars.js functions\gang\clock.js functions\gang\config.js functions\gang\core.js functions\gang\test\exploits.test.js functions\gang\test\fakeFirestore.js functions\gang\test\intel.test.js functions\gang\test\trade.test.js functions\gang\test\v146.test.js functions\gym.js functions\houses.js functions\index.js functions\package-lock.json functions\package.json functions\scripts\belediye.test.mjs functions\scripts\casino.test.mjs functions\scripts\champ-prizes.test.mjs functions\scripts\cosmetics.test.mjs functions\scripts\game-casino-vault.test.mjs functions\scripts\materials.test.mjs functions\scripts\state-treasury.test.mjs functions\scripts\v125.test.mjs functions\scripts\v135.test.mjs functions\scripts\v146-hq.test.mjs functions\shop.js functions\stream.js functions\tax.js functions\venue.js functions\venueLayouts.js public\neon-flags.json src\App.jsx src\components\BankScreen\BankScreen.jsx src\components\City\CityScreen.jsx src\components\City\cityEngine.js src\components\City\cityLayout.js src\components\City\cityMapMath.js src\components\City\jobBuildings.js src\components\City\story\storyData.js src\components\City\world\layouts.js src\components\City\world\newItems.js src\components\City\world\outerWorld.js src\components\City\world\venues.js src\components\CostumeShop\CostumeShop.jsx src\components\FactoryScreen\FactoryScreen.css src\components\FactoryScreen\FactoryScreen.jsx src\components\Guest\GuestWelcome.jsx src\components\GuideScreen\guideContent.js src\components\HouseScreen\HouseScreen.jsx src\components\HouseScreen\houseCatalog.js src\components\MekanlarScreen\MekanlarScreen.jsx src\components\Phone\cappstoreApps.js src\components\ReferralPrompt\ReferralPrompt.jsx src\components\Venue3D\Venue3D.css src\components\Venue3D\VenueLayer.jsx src\hooks\useOnboarding.js src\hooks\useOpenFactories.js src\lib\forceUpdate.js src\lib\moneySources.js src\services\gameActions.js tests\ui\v195-ui.test.mjs"
set "YENI=docs\v196-guncelleme.md docs\v196-plan.md functions\home.js functions\homeGeometry.js functions\scripts\v196-closing.test.mjs functions\scripts\v196-economy.test.mjs functions\scripts\v196-home.test.mjs functions\scripts\v196-migration.test.mjs functions\v196Closing.js functions\v196Migration.js functions\v196Prices.js functions\v196Shared.js src\components\City\HomePanel.css src\components\City\HomePanel.jsx src\components\City\world\houseFloors.js src\components\FactoryScreen\FactoryWorkButton.jsx src\components\Venue3D\venueGameParts.jsx"
set "SIL=functions\gang\test\market.test.js functions\scripts\business.test.mjs functions\scripts\furn-market.test.mjs functions\scripts\houses.test.mjs"
if not exist "%HERE%yedek" mkdir "%HERE%yedek"
for %%F in (%DEGISEN% %SIL%) do (
  if exist "%%F" if not exist "%HERE%yedek\%%F" xcopy "%%F" "%HERE%yedek\%%F*" /Y /Q >nul
)
if not exist "%HERE%yedek\_yeni.txt" (
  type nul > "%HERE%yedek\_yeni.txt"
  for %%F in (%YENI%) do (
    if not exist "%%F" (echo %%F>> "%HERE%yedek\_yeni.txt") else (if not exist "%HERE%yedek\%%F" xcopy "%%F" "%HERE%yedek\%%F*" /Y /Q >nul)
  )
)
xcopy "%HERE%dosyalar\*" "%CD%" /E /Y /I /Q >nul
if errorlevel 1 (
  echo Dosyalar kopyalanamadi. HICBIR SEY GONDERILMEDI. Ciktiyi Claude'a gonder.
  goto son
)
for %%F in (%SIL%) do (
  if exist "%%F" del /q "%%F"
)
echo   Dosyalar yerinde. Eski hali: _v196\yedek

echo.
echo ===== 2/6 arayuz derleme kontrolu =====
call npm run build
if errorlevel 1 (
  echo.
  echo Arayuz derlenemedi. HICBIR SEY GONDERILMEDI. Geri almak icin geri-al-v196.bat. Ciktiyi Claude'a gonder.
  goto son
)

echo.
echo ===== 3/6 testler =====
call npm --prefix functions test
if errorlevel 1 (
  echo.
  echo Sunucu testleri basarisiz. HICBIR SEY GONDERILMEDI. Geri almak icin geri-al-v196.bat. Ciktiyi Claude'a gonder.
  goto son
)
node --test "tests/ui/*.test.mjs" "tests/city/*.test.mjs" "tests/cost/*.test.mjs" "tests/clock/*.test.mjs"
if errorlevel 1 (
  echo.
  echo Arayuz testleri basarisiz. HICBIR SEY GONDERILMEDI. Geri almak icin geri-al-v196.bat. Ciktiyi Claude'a gonder.
  goto son
)

echo.
echo ===== 4/6 Firebase: TUM fonksiyonlar + indeksler (ONCE sunucu, sonra site) - uzun surebilir =====
REM Silinecek fonksiyon / indeks sorarsa N de ve ciktiyi Claude'a gonder.
set "HEDEF=functions,firestore:indexes"
call firebase deploy --only %HEDEF%
if errorlevel 1 (
  echo.
  echo Ilk deneme basarisiz - 30 sn sonra bir kez daha deneniyor...
  timeout /t 30 /nobreak >nul
  call firebase deploy --only %HEDEF%
  if errorlevel 1 (
    echo.
    echo Firebase yuklenemedi. git push YAPILMADI ^(site degismedi^). Bu dosyayi tekrar calistir; olmazsa ciktiyi Claude'a gonder.
    goto son
  )
)

echo.
echo ===== 5/6 git commit + push (sadece v196 dosyalari) =====
set GIT_ASK_YESNO=false
git rm -q --cached --ignore-unmatch -- functions/gang/test/market.test.js functions/scripts/business.test.mjs functions/scripts/furn-market.test.mjs functions/scripts/houses.test.mjs
git add -- docs/v196-guncelleme.md docs/v196-plan.md firestore.indexes.json functions/belediyeGazete.js functions/belediyeRates.js functions/borsa.js functions/business.js functions/casinoRules.js functions/championshipPrizes.js functions/cityJobsData.js functions/cosmeticsData.js functions/depo.js functions/gang/actions/market.js functions/gang/actions/trade.js functions/gang/actions/wars.js functions/gang/clock.js functions/gang/config.js functions/gang/core.js functions/gang/test/exploits.test.js functions/gang/test/fakeFirestore.js functions/gang/test/intel.test.js functions/gang/test/trade.test.js functions/gang/test/v146.test.js functions/gym.js functions/home.js functions/homeGeometry.js functions/houses.js functions/index.js functions/package-lock.json functions/package.json functions/scripts/belediye.test.mjs functions/scripts/casino.test.mjs functions/scripts/champ-prizes.test.mjs functions/scripts/cosmetics.test.mjs functions/scripts/game-casino-vault.test.mjs functions/scripts/materials.test.mjs functions/scripts/state-treasury.test.mjs functions/scripts/v125.test.mjs functions/scripts/v135.test.mjs functions/scripts/v146-hq.test.mjs functions/scripts/v196-closing.test.mjs functions/scripts/v196-economy.test.mjs functions/scripts/v196-home.test.mjs functions/scripts/v196-migration.test.mjs functions/shop.js functions/stream.js functions/tax.js functions/v196Closing.js functions/v196Migration.js functions/v196Prices.js functions/v196Shared.js functions/venue.js functions/venueLayouts.js public/neon-flags.json src/App.jsx src/components/BankScreen/BankScreen.jsx src/components/City/CityScreen.jsx src/components/City/HomePanel.css src/components/City/HomePanel.jsx src/components/City/cityEngine.js src/components/City/cityLayout.js src/components/City/cityMapMath.js src/components/City/jobBuildings.js src/components/City/story/storyData.js src/components/City/world/houseFloors.js src/components/City/world/layouts.js src/components/City/world/newItems.js src/components/City/world/outerWorld.js src/components/City/world/venues.js src/components/CostumeShop/CostumeShop.jsx src/components/FactoryScreen/FactoryScreen.css src/components/FactoryScreen/FactoryScreen.jsx src/components/FactoryScreen/FactoryWorkButton.jsx src/components/Guest/GuestWelcome.jsx src/components/GuideScreen/guideContent.js src/components/HouseScreen/HouseScreen.jsx src/components/HouseScreen/houseCatalog.js src/components/MekanlarScreen/MekanlarScreen.jsx src/components/Phone/cappstoreApps.js src/components/ReferralPrompt/ReferralPrompt.jsx src/components/Venue3D/Venue3D.css src/components/Venue3D/VenueLayer.jsx src/components/Venue3D/venueGameParts.jsx src/hooks/useOnboarding.js src/hooks/useOpenFactories.js src/lib/forceUpdate.js src/lib/moneySources.js src/services/gameActions.js tests/ui/v195-ui.test.mjs _v196/yukle-v196.bat _v196/geri-al-v196.bat _v196/gecis-v196.bat _v196/asama1/yukle-v196-asama1.bat
git commit -q -m "v196: mekanlar oyunun (oyuncu ev / ofis / isletme kapandi), 8 mekan hissesi, 5 yeni mekan, fabrika Calis + elmas makinesi, 3 katli ev (Evler, tasarla, ayarlar), cete otomatik satis, hisse senedi yatirimi kalkti, yeni oyuncu 5.000, sampiyona odulleri, rehber" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_0182eo1Kgr7uUvibch1rUbXf"
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
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $sha=(git rev-parse HEAD).Trim(); $url='https://api.github.com/repos/cetelerinsavasi-afk/neon-sehir/commits/'+$sha+'/check-runs'; $sonuc=$null; for($i=0;$i -lt 32;$i++){ Start-Sleep -Seconds 15; try{ $r=Invoke-RestMethod -Uri $url -Headers @{'User-Agent'='neon-sehir-deploy';'Accept'='application/vnd.github+json'} }catch{ continue }; $cf=$r.check_runs | Where-Object { $_.name -like 'Workers Builds*' } | Select-Object -First 1; if(-not $cf){ Write-Host '  ...Cloudflare henuz baslamadi'; continue }; if($cf.status -ne 'completed'){ Write-Host '  ...Cloudflare derliyor'; continue }; $sonuc=$cf.conclusion; break }; Write-Host ''; if($sonuc -eq 'success'){ Write-Host 'TAMAM: v196 yayinda. Oyunu yenile (telefonda uygulamayi kapatip ac).' -ForegroundColor Green } elseif($sonuc){ Write-Host ('Cloudflare derlemesi BASARISIZ ('+$sonuc+'). Cloudflare panelinde Workers > neon-sehir > Deployments hata kaydini Claude''a gonder.') -ForegroundColor Red } else { Write-Host 'Cloudflare 8 dk icinde derlemeyi bitirmedi. Cloudflare panelinde Workers > neon-sehir > Deployments''ta son commit icin Retry build de.' -ForegroundColor Yellow }"
echo.
echo SIMDI: gecis-v196.bat -^> 5 Uygula (rapor kimligi) -^> 6 Durum
goto son

:yanlis
echo Bu _v196 klasoru neon-sehir klasorunun ICINDE olmali. HICBIR SEY YAPILMADI.

:son
echo.
pause
