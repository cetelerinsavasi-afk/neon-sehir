@echo off
REM ============================================================================
REM Neon Sehir v189 - TEK TIK, TUM GUNCELLEMELER (Faz 1 + Faz 2 + Faz 3)
REM Bu _v189 klasoru neon-sehir klasorunun ICINDE olmali. Ara surumleri (v187, v188)
REM ayrica yuklemene gerek YOK; hepsi bunun icinde.
REM  Faz 1: silahci soygunu 40.000, yaris seridi govdeye oturur, kapi numarasi,
REM         dokunup vazgecme, Firestore okuma olcumu (27 Kasim'a kadar) + okuma-raporu.bat
REM  Faz 2: "kac kisi var" sadece RTDB, rozetler RTDB'den, zorunlu guncelleme (minBuild)
REM  Faz 3: Neon Borsa sinirsiz + kusuratli hisse, 20 hisse sinir, gece temettu avi engeli,
REM         20 gun oyuna girmeyen, canli fiyat RTDB, hizli basislar birlesir
REM Siralama: yedek > derleme > testler > Firebase (fonksiyonlar + RTDB kurallari) > git push > site
REM Geri donus: _v189\geri-al-v189.bat
REM ============================================================================
setlocal
set "HERE=%~dp0"
cd /d "%HERE%.."
if not exist "package.json" goto yanlis
if not exist ".git" goto yanlis
if not exist "%HERE%dosyalar\functions\borsa.js" (
  echo _v189\dosyalar eksik. HICBIR SEY YAPILMADI.
  goto son
)

set "DEGISEN=database.rules.json functions\accountDeletion.js functions\borsa.js functions\index.js functions\presenceSummary.js functions\scripts\borsa.test.mjs functions\scripts\presence-summary.test.mjs functions\scripts\presenceSummary.test.mjs public\neon-flags.json src\components\BankScreen\BankScreen.jsx src\components\City\CityScreen.jsx src\components\City\vehicles.js src\components\HeistPanel\HeistPanel.jsx src\components\Phone\borsa\BorsaApp.css src\components\Phone\borsa\BorsaApp.jsx src\components\TopNotificationBanner\TopNotificationBanner.jsx src\hooks\useBorsaMarket.js src\hooks\usePolledPresence.js src\hooks\useUnreadNotifications.js src\lib\fsMeter\meter.js src\lib\fsMeter\runtime.js src\lib\occupancy.js src\main.jsx vite.config.js"
set "YENI=docs\v189-borsa.md functions\badgeFeed.js functions\scripts\badge-feed.test.mjs functions\scripts\borsa-deletion.test.mjs functions\scripts\heist-reward.test.mjs okuma-raporu.bat scripts\okuma-raporu.mjs src\lib\badgeFeed.js src\lib\forceUpdate.js src\lib\tapGuard.js tests\city\arac-modifiye.test.mjs tests\cost\fs-meter-window.test.mjs tests\cost\okuma-raporu.test.mjs tests\ui\badge-feed.test.mjs tests\ui\borsa-ui.test.mjs tests\ui\force-update.test.mjs tests\ui\tap-guard.test.mjs"

echo.
echo ===== 1/6 yedek + yeni dosyalar =====
if not exist "%HERE%yedek" mkdir "%HERE%yedek"
for %%F in (%DEGISEN%) do (
  if exist "%%F" if not exist "%HERE%yedek\%%F" xcopy "%%F" "%HERE%yedek\%%F*" /Y /Q >nul
)
if not exist "%HERE%yedek\_yeni.txt" (
  type nul > "%HERE%yedek\_yeni.txt"
  for %%F in (%YENI%) do (
    if not exist "%%F" echo %%F>> "%HERE%yedek\_yeni.txt"
  )
)
xcopy "%HERE%dosyalar\*" "%CD%" /E /Y /I /Q >nul
if errorlevel 1 (
  echo Dosyalar kopyalanamadi. HICBIR SEY GONDERILMEDI. Ciktiyi Claude'a gonder.
  goto son
)
echo   Dosyalar yerinde. Eski hali: _v189\yedek

echo.
echo ===== 2/6 arayuz derleme kontrolu =====
call npm run build
if errorlevel 1 (
  echo.
  echo Arayuz derlenemedi. HICBIR SEY GONDERILMEDI. Geri almak icin geri-al-v189.bat. Ciktiyi Claude'a gonder.
  goto son
)

echo.
echo ===== 3/6 testler =====
set "TESTLER="
for %%Q in ("functions\scripts\borsa.test.mjs" "functions\scripts\borsa-deletion.test.mjs" "functions\scripts\presenceSummary.test.mjs" "functions\scripts\presence-summary.test.mjs" "functions\scripts\badge-feed.test.mjs" "functions\scripts\heist-reward.test.mjs" "functions\scripts\v145.test.mjs" "functions\scripts\read-stats.test.mjs" "functions\scripts\stream.test.mjs" "functions\scripts\six-image.test.mjs" "functions\scripts\moderation.test.mjs" "functions\scripts\delete-user.test.mjs" "functions\scripts\shop.test.mjs" "functions\scripts\fleet.test.mjs" "functions\scripts\business.test.mjs" "tests\ui\borsa-ui.test.mjs" "tests\ui\force-update.test.mjs" "tests\ui\badge-feed.test.mjs" "tests\ui\tap-guard.test.mjs" "tests\city\arac-modifiye.test.mjs" "tests\cost\fs-meter.test.mjs" "tests\cost\fs-shim-off.test.mjs" "tests\cost\fs-shim-on.test.mjs" "tests\cost\fs-meter-window.test.mjs" "tests\cost\okuma-raporu.test.mjs" "tests\cost\daily-gate.test.mjs" "tests\webview\webview.test.mjs" "tests\city\jobs-resume.test.mjs" "tests\city\kurye.test.mjs" "tests\city\nav-route.test.mjs" "tests\clock\clock-sync.test.mjs" "tests\clock\server-clock.test.mjs") do (
  if exist "%%~Q" call set "TESTLER=%%TESTLER%% %%~Q"
)
node --test %TESTLER%
if errorlevel 1 (
  echo.
  echo Testler basarisiz. HICBIR SEY GONDERILMEDI. Geri almak icin geri-al-v189.bat. Ciktiyi Claude'a gonder.
  goto son
)

echo.
echo ===== 4/6 Firebase: fonksiyonlar + Realtime Database kurallari (ONCE sunucu, sonra site) =====
REM Zamanlanmis isler (borsa saatlik is, presenceSummary, expireInteriorPresence) ayri fonksiyon degil,
REM cronTick icinde calisir (v138) - bu yuzden cronTick yuklenir.
set "FN=functions:borsaAction,functions:requestAccountDeletion,functions:adminAccountDeletion,functions:attemptHeist,functions:executeHeistPlan,functions:clientReadStats,functions:sendChatMessage,functions:createSixtagramPost,functions:cronTick,database"
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
echo ===== 5/6 git commit + push (sadece v189 dosyalari) =====
set GIT_ASK_YESNO=false
git add -- database.rules.json docs/v189-borsa.md functions/accountDeletion.js functions/badgeFeed.js functions/borsa.js functions/index.js functions/presenceSummary.js functions/scripts/badge-feed.test.mjs functions/scripts/borsa-deletion.test.mjs functions/scripts/borsa.test.mjs functions/scripts/heist-reward.test.mjs functions/scripts/presence-summary.test.mjs functions/scripts/presenceSummary.test.mjs okuma-raporu.bat public/neon-flags.json scripts/okuma-raporu.mjs src/components/BankScreen/BankScreen.jsx src/components/City/CityScreen.jsx src/components/City/vehicles.js src/components/HeistPanel/HeistPanel.jsx src/components/Phone/borsa/BorsaApp.css src/components/Phone/borsa/BorsaApp.jsx src/components/TopNotificationBanner/TopNotificationBanner.jsx src/hooks/useBorsaMarket.js src/hooks/usePolledPresence.js src/hooks/useUnreadNotifications.js src/lib/badgeFeed.js src/lib/forceUpdate.js src/lib/fsMeter/meter.js src/lib/fsMeter/runtime.js src/lib/occupancy.js src/lib/tapGuard.js src/main.jsx tests/city/arac-modifiye.test.mjs tests/cost/fs-meter-window.test.mjs tests/cost/okuma-raporu.test.mjs tests/ui/badge-feed.test.mjs tests/ui/borsa-ui.test.mjs tests/ui/force-update.test.mjs tests/ui/tap-guard.test.mjs vite.config.js _v189/yukle-v189.bat _v189/geri-al-v189.bat _v189/NOTLAR.txt
git commit -q -m "v189: Neon Borsa sinirsiz ve kusuratli hisse (BigInt fiyat, 20 hisse, gece temettu avi engeli, tembel gecis, 20 gun oyuna girmeyen, canli fiyat RTDB); Firestore tasarrufu (kac kisi var ve rozetler RTDB, zorunlu guncelleme); silahci 40.000, yaris seridi, kapi numarasi, dokunup vazgecme, okuma olcumu" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_0182eo1KDAiqXDNdScxr225v"
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
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $sha=(git rev-parse HEAD).Trim(); $url='https://api.github.com/repos/cetelerinsavasi-afk/neon-sehir/commits/'+$sha+'/check-runs'; $sonuc=$null; for($i=0;$i -lt 32;$i++){ Start-Sleep -Seconds 15; try{ $r=Invoke-RestMethod -Uri $url -Headers @{'User-Agent'='neon-sehir-deploy';'Accept'='application/vnd.github+json'} }catch{ continue }; $cf=$r.check_runs | Where-Object { $_.name -like 'Workers Builds*' } | Select-Object -First 1; if(-not $cf){ Write-Host '  ...Cloudflare henuz baslamadi'; continue }; if($cf.status -ne 'completed'){ Write-Host '  ...Cloudflare derliyor'; continue }; $sonuc=$cf.conclusion; break }; Write-Host ''; if($sonuc -eq 'success'){ Write-Host 'TAMAM: v189 yayinda. Oyunu yenile (telefonda uygulamayi kapatip ac).' -ForegroundColor Green } elseif($sonuc){ Write-Host ('Cloudflare derlemesi BASARISIZ ('+$sonuc+'). Cloudflare panelinde Workers > neon-sehir > Deployments hata kaydini Claude''a gonder.') -ForegroundColor Red } else { Write-Host 'Cloudflare 8 dk icinde derlemeyi bitirmedi. Cloudflare panelinde Workers > neon-sehir > Deployments''ta son commit icin Retry build de.' -ForegroundColor Yellow }"
goto son

:yanlis
echo Bu _v189 klasoru neon-sehir klasorunun ICINDE olmali. HICBIR SEY YAPILMADI.

:son
echo.
pause
