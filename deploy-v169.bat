@echo off
REM ============================================================================
REM Neon Sehir v169 - 7 DUZELTME - TEK TIK
REM   1) Karargahta Baba/yetkili botu (ve hayvani) duzenleyebilir ("evin sahibi degilsin" hatasi)
REM   2) Sehirde CANLI yayin butonu yuvarlak; yayin acilinca sag butonlar sola kaymaz
REM   3) Yaris pisti kasma: buzlu cam dugmeler kalkti, neon serit tek seferde cizilir,
REM      isiklar hazir doku, zayif telefonda otomatik dusuk kalite (fizik/sure ayni)
REM   4) Fabrika makine fiyati: yazan fiyat = cekilen para (sunucu farkliysa almaz, yeni fiyati soyler)
REM   5) Camlica Koyu tomruklari yere oturdu (+ kamyon tekerleri)
REM   6) Camlica'nin arka kosesinde patikali kucuk mezarlik (8 mezar)
REM   7) Profil: Araclar / Silahlar acilir-kapanir, araclar Araba / Ticari / Motor sekmeli
REM SITE + 2 FONKSIYON (buyFactoryMachine, houseAction). Firestore okuma/yazma artmaz.
REM Geri donus: geri-al-v169.bat
REM ============================================================================
setlocal
cd /d "%~dp0"
if not exist "package.json" goto yanlis
if not exist ".git" goto yanlis
if not exist "functions\scripts\v169-hq-bot.test.mjs" (
  echo v169 dosyalari bulunamadi ^(functions\scripts\v169-hq-bot.test.mjs yok^). Zip'i neon-sehir klasorune ac. HICBIR SEY YAPILMADI.
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
for %%T in ("tests\webview\webview.test.mjs" "tests\city\jobs-resume.test.mjs" "tests\city\kurye.test.mjs" "tests\city\nav-route.test.mjs" "tests\clock\clock-sync.test.mjs" "tests\clock\server-clock.test.mjs" "tests\cost\daily-gate.test.mjs" "tests\cost\fs-meter.test.mjs" "tests\cost\fs-shim-off.test.mjs" "tests\cost\fs-shim-on.test.mjs" "functions\scripts\onboarding.test.mjs" "functions\scripts\v147-cityphoto.test.mjs" "functions\scripts\houses.test.mjs" "functions\scripts\v146-hq.test.mjs" "functions\scripts\pets.test.mjs" "functions\scripts\v154-machines.test.mjs" "functions\scripts\factory-tax.test.mjs" "functions\scripts\raceTa.test.mjs" "functions\scripts\v169-hq-bot.test.mjs") do (
  if exist "%%~T" call set "TESTLER=%%TESTLER%% %%~T"
)
node --test %TESTLER%
if errorlevel 1 (
  echo.
  echo Testler basarisiz. HICBIR SEY GONDERILMEDI. Ciktiyi Claude'a gonder.
  goto son
)

echo.
echo ===== 3/5 Firebase fonksiyonlari (buyFactoryMachine, houseAction) =====
call firebase deploy --only functions:buyFactoryMachine,functions:houseAction
if errorlevel 1 (
  echo.
  echo Ilk deneme basarisiz - 20 sn sonra bir kez daha deneniyor...
  timeout /t 20 /nobreak >nul
  call firebase deploy --only functions:buyFactoryMachine,functions:houseAction
  if errorlevel 1 (
    echo.
    echo Fonksiyonlar yuklenemedi. git push YAPILMADI ^(site degismedi^). Biraz sonra tekrar calistir; olmazsa ciktiyi Claude'a gonder.
    goto son
  )
)

echo.
echo ===== 4/5 git commit + push (sadece v169 dosyalari) =====
set GIT_ASK_YESNO=false
git add -- functions/houses.js functions/index.js functions/scripts/v169-hq-bot.test.mjs src/components/City/world/roadside.js src/components/FactoryScreen/FactoryScreen.jsx src/components/HomeScreen/HomeScreen.css src/components/HomeScreen/HomeScreen.jsx src/components/RaceTrackScreen/TimeAttackRace.css src/components/RaceTrackScreen/timeAttackGame.js src/components/Stream/Stream.css src/services/gameActions.js deploy-v169.bat geri-al-v169.bat kur-ve-yayinla-v169.bat
git commit -q -m "v169: karargah bot yetkisi, yuvarlak canli butonu, yaris kasma, makine fiyati, Camlica tomruk + mezarlik, profil arac/silah paneli" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_0182eo1GATRaA3msjCVjNeeZ"
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
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $sha=(git rev-parse HEAD).Trim(); $url='https://api.github.com/repos/cetelerinsavasi-afk/neon-sehir/commits/'+$sha+'/check-runs'; $sonuc=$null; for($i=0;$i -lt 32;$i++){ Start-Sleep -Seconds 15; try{ $r=Invoke-RestMethod -Uri $url -Headers @{'User-Agent'='neon-sehir-deploy';'Accept'='application/vnd.github+json'} }catch{ continue }; $cf=$r.check_runs | Where-Object { $_.name -like 'Workers Builds*' } | Select-Object -First 1; if(-not $cf){ Write-Host '  ...Cloudflare henuz baslamadi'; continue }; if($cf.status -ne 'completed'){ Write-Host '  ...Cloudflare derliyor'; continue }; $sonuc=$cf.conclusion; break }; Write-Host ''; if($sonuc -eq 'success'){ Write-Host 'TAMAM: v169 yayinda. Oyunu yenile.' -ForegroundColor Green } elseif($sonuc){ Write-Host ('Cloudflare derlemesi BASARISIZ ('+$sonuc+'). Cloudflare panelinde Workers > neon-sehir > Deployments hata kaydini Claude''a gonder.') -ForegroundColor Red } else { Write-Host 'Cloudflare 8 dk icinde derlemeyi bitirmedi. Cloudflare panelinde Workers > neon-sehir > Deployments''ta son commit icin Retry build de.' -ForegroundColor Yellow }"
goto son

:yanlis
echo Bu dosya neon-sehir proje klasorunun ICINDE olmali. HICBIR SEY YAPILMADI.

:son
echo.
pause
