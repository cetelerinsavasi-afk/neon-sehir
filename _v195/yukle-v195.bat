@echo off
REM ============================================================================
REM Neon Sehir v195 - TEK TIK (bu _v195 klasoru neon-sehir klasorunun ICINDE olmali)
REM ONCE v194 yuklenmis olmali.
REM  - 20 gun oyuna girmeyen oyuncunun isletmeleri + ofisleri pasif: listede yok, para kazanmaz;
REM    oyuncu girince otomatik acilir (stok / esya / para oldugu gibi)
REM  - Oyunun magazasinda esit fiyatta BUGUN en az kazanan satar (sonra dunku sira)
REM  - Araba + ticari: 10 gun omur + 10 tamir (+1 gun); motorlar 20 gun (degismedi)
REM  - Ticari arac tamir olur, gelistirilmez; ticari gelir x1,5
REM  - Futbol transfer destegi x2 (kasa tavani da) - Cete yasakli madde: uye x 3 adet
REM  - Tek seferlik gecis: omru 10'dan fazla araba / ticari 10'a (Firebase yuklendikten sonra otomatik)
REM Firebase: TUM fonksiyonlar (ortak moduller degisti). Kurallar ve indeks DEGISMEDI.
REM Ayrinti: docs\v195-guncelleme.md
REM ============================================================================
setlocal
set "HERE=%~dp0"
cd /d "%HERE%.."
if not exist "package.json" goto yanlis
if not exist ".git" goto yanlis
if not exist "src\components\Guest\GuestWelcome.jsx" (
  echo Once v194 yuklenmeli. HICBIR SEY YAPILMADI.
  goto son
)
if not exist "%HERE%dosyalar\functions\bizPassive.js" (
  echo _v195\dosyalar eksik. HICBIR SEY YAPILMADI.
  goto son
)

set "DEGISEN=functions\business.js functions\casino.js functions\catalogData.js functions\depo.js functions\gym.js functions\houses.js functions\index.js functions\itemRules.js functions\office.js functions\package.json functions\shop.js functions\shopStockRules.js functions\vehicleKinds.js functions\venue.js functions\gang\clock.js functions\gang\config.js functions\gang\actions\trade.js functions\gang\test\trade.test.js functions\scripts\credit.test.mjs functions\scripts\fleet.test.mjs functions\scripts\shop.test.mjs functions\scripts\v151-jobs.test.mjs public\neon-flags.json src\lib\forceUpdate.js src\components\City\CityScreen.jsx src\components\Gangs\DepoSellSheet.jsx src\components\Gangs\gangConstants.js src\components\Gangs\tabs\TradeTab.jsx src\components\GuideScreen\guideContent.js src\components\MarketplaceScreen\MarketplaceScreen.jsx src\components\NewspaperScreen\NewspaperScreen.jsx src\components\VehicleCard\VehicleCard.jsx src\components\Workshop\Workshop.jsx src\hooks\useBusinessList.js src\hooks\useOfficeList.js"
set "YENI=docs\v195-guncelleme.md functions\bizPassive.js functions\v195Migration.js functions\scripts\v195.test.mjs tests\ui\v195-ui.test.mjs"

echo.
echo ===== 1/7 yedek + yeni dosyalar =====
if not exist "%HERE%yedek" mkdir "%HERE%yedek"
for %%F in (%DEGISEN%) do (
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
echo   Dosyalar yerinde. Eski hali: _v195\yedek

echo.
echo ===== 2/7 arayuz derleme kontrolu =====
call npm run build
if errorlevel 1 (
  echo.
  echo Arayuz derlenemedi. HICBIR SEY GONDERILMEDI. Geri almak icin geri-al-v195.bat. Ciktiyi Claude'a gonder.
  goto son
)

echo.
echo ===== 3/7 testler =====
set "TESTLER="
for %%Q in ("functions\scripts\v195.test.mjs" "functions\scripts\shop.test.mjs" "functions\scripts\business.test.mjs" "functions\scripts\credit.test.mjs" "functions\scripts\v151-jobs.test.mjs" "functions\scripts\fleet.test.mjs" "functions\scripts\gym.test.mjs" "functions\scripts\venue.test.mjs" "functions\scripts\depo.test.mjs" "functions\scripts\casino.test.mjs" "functions\scripts\player-casino.test.mjs" "functions\scripts\homeoffice.test.mjs" "functions\scripts\houses.test.mjs" "functions\scripts\stream.test.mjs" "functions\scripts\v157-far-jobs.test.mjs" "functions\scripts\v158-far-back.test.mjs" "functions\gang\test\trade.test.js" "tests\ui\v195-ui.test.mjs" "tests\ui\force-update.test.mjs" "tests\ui\city-hud.test.mjs" "tests\city\kurye.test.mjs" "tests\city\jobs-resume.test.mjs") do (
  if exist "%%~Q" call set "TESTLER=%%TESTLER%% %%~Q"
)
node --test %TESTLER%
if errorlevel 1 (
  echo.
  echo Testler basarisiz. HICBIR SEY GONDERILMEDI. Geri almak icin geri-al-v195.bat. Ciktiyi Claude'a gonder.
  goto son
)

echo.
echo ===== 4/7 Firebase: TUM fonksiyonlar (ONCE sunucu, sonra site) - uzun surebilir =====
REM Silinecek fonksiyon sorarsa (beklenmez) N de ve ciktiyi Claude'a gonder.
call firebase deploy --only functions
if errorlevel 1 (
  echo.
  echo Ilk deneme basarisiz - 30 sn sonra bir kez daha deneniyor...
  timeout /t 30 /nobreak >nul
  call firebase deploy --only functions
  if errorlevel 1 (
    echo.
    echo Firebase yuklenemedi. git push YAPILMADI ^(site degismedi^). Bu dosyayi tekrar calistir; olmazsa ciktiyi Claude'a gonder.
    goto son
  )
)

echo.
echo ===== 5/7 tek seferlik arac omru gecisi (bir kez calisir, tekrar acmak zararsiz) =====
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; try { $r = Invoke-RestMethod -TimeoutSec 600 -Uri 'https://europe-west1-neon-sehir.cloudfunctions.net/runV195MigrationNow?secret=854f8bf3de15bf540bd36a26a3cce7e5'; Write-Host ('  Gecis: ' + ($r | ConvertTo-Json -Compress)) -ForegroundColor Green } catch { Write-Host ('  Gecis calismadi: ' + $_.Exception.Message) -ForegroundColor Yellow; Write-Host '  Site yine yuklenecek. Sonra docs\v195-guncelleme.md icindeki adresi tarayicida ac (00:30 sonrasi).' -ForegroundColor Yellow }"

echo.
echo ===== 6/7 git commit + push (sadece v195 dosyalari) =====
set GIT_ASK_YESNO=false
git add -- functions/business.js functions/casino.js functions/catalogData.js functions/depo.js functions/gym.js functions/houses.js functions/index.js functions/itemRules.js functions/office.js functions/package.json functions/shop.js functions/shopStockRules.js functions/vehicleKinds.js functions/venue.js functions/gang/clock.js functions/gang/config.js functions/gang/actions/trade.js functions/gang/test/trade.test.js functions/scripts/credit.test.mjs functions/scripts/fleet.test.mjs functions/scripts/shop.test.mjs functions/scripts/v151-jobs.test.mjs public/neon-flags.json src/lib/forceUpdate.js src/components/City/CityScreen.jsx src/components/Gangs/DepoSellSheet.jsx src/components/Gangs/gangConstants.js src/components/Gangs/tabs/TradeTab.jsx src/components/GuideScreen/guideContent.js src/components/MarketplaceScreen/MarketplaceScreen.jsx src/components/NewspaperScreen/NewspaperScreen.jsx src/components/VehicleCard/VehicleCard.jsx src/components/Workshop/Workshop.jsx src/hooks/useBusinessList.js src/hooks/useOfficeList.js docs/v195-guncelleme.md functions/bizPassive.js functions/v195Migration.js functions/scripts/v195.test.mjs tests/ui/v195-ui.test.mjs _v195/yukle-v195.bat _v195/geri-al-v195.bat
git commit -q -m "v195: 20 gun girmeyenin mekanlari pasif (girince otomatik acilir, ofisler dahil), oyunun magazasinda esit fiyatta bugunun en az kazanani, araba+ticari 10 gun + 10 tamir (+1 gun), motor 20 gun, ticari tamir olur gelistirilmez, ticari gelir x1.5, futbol transfer destegi x2, cete yasakli madde uye x 3 adet, tek seferlik omur gecisi" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_0182eo1LJWUXXgJbYGfDvZNF"
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
echo ===== 7/7 Cloudflare derlemesi bekleniyor (en fazla ~8 dk) =====
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $sha=(git rev-parse HEAD).Trim(); $url='https://api.github.com/repos/cetelerinsavasi-afk/neon-sehir/commits/'+$sha+'/check-runs'; $sonuc=$null; for($i=0;$i -lt 32;$i++){ Start-Sleep -Seconds 15; try{ $r=Invoke-RestMethod -Uri $url -Headers @{'User-Agent'='neon-sehir-deploy';'Accept'='application/vnd.github+json'} }catch{ continue }; $cf=$r.check_runs | Where-Object { $_.name -like 'Workers Builds*' } | Select-Object -First 1; if(-not $cf){ Write-Host '  ...Cloudflare henuz baslamadi'; continue }; if($cf.status -ne 'completed'){ Write-Host '  ...Cloudflare derliyor'; continue }; $sonuc=$cf.conclusion; break }; Write-Host ''; if($sonuc -eq 'success'){ Write-Host 'TAMAM: v195 yayinda. Oyunu yenile (telefonda uygulamayi kapatip ac).' -ForegroundColor Green } elseif($sonuc){ Write-Host ('Cloudflare derlemesi BASARISIZ ('+$sonuc+'). Cloudflare panelinde Workers > neon-sehir > Deployments hata kaydini Claude''a gonder.') -ForegroundColor Red } else { Write-Host 'Cloudflare 8 dk icinde derlemeyi bitirmedi. Cloudflare panelinde Workers > neon-sehir > Deployments''ta son commit icin Retry build de.' -ForegroundColor Yellow }"
goto son

:yanlis
echo Bu _v195 klasoru neon-sehir klasorunun ICINDE olmali. HICBIR SEY YAPILMADI.

:son
echo.
pause
