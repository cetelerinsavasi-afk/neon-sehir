@echo off
REM ============================================================================
REM Neon Sehir v194 - TEK TIK (bu _v194 klasoru neon-sehir klasorunun ICINDE olmali)
REM ONCE v190 yuklenmis olmali. v191 + v192 + v193'u de ICERIR (ayrica yukleme).
REM  - v194: sade sehir ana ekrani (supheli + altin tek hap, "N kisi yakinda" tiklanir, 3D cipi mini haritada,
REM          cizim araba ikonu, sohbet son 2 mesaj; misafirde de ayni duzen), borsa geri seridi ve kisa hisse yazisi
REM  - v193: gercekci carpma + havada suzulme, sohbet en alta, tir fotografi, sade borsa kurali
REM  - v192: direksiyon, tir gorevi kasma, RTDB maliyeti, misafir karsilama
REM  - v191: kalabalikta kasma, harita acikken atma, takilma kaydi
REM Firebase: borsaAction + cronTick + cityAction (v193'ten). Kurallar DEGISMEDI. Ayrinti: docs\v194-ana-ekran.md
REM ============================================================================
setlocal
set "HERE=%~dp0"
cd /d "%HERE%.."
if not exist "package.json" goto yanlis
if not exist ".git" goto yanlis
if not exist "src\lib\forceUpdate.js" (
  echo Once v189/v190 yuklenmeli. HICBIR SEY YAPILMADI.
  goto son
)
if not exist "%HERE%dosyalar\functions\borsa.js" (
  echo _v194\dosyalar eksik. HICBIR SEY YAPILMADI.
  goto son
)

set "DEGISEN=functions\borsa.js functions\cityPhoto.js functions\scripts\borsa.test.mjs preview\borsa-app.jsx preview\mocks\firebase-auth.js public\neon-flags.json src\components\BankScreen\BankScreen.css src\components\City\City.css src\components\City\CityPhoto.jsx src\components\City\CityScreen.jsx src\components\City\cityEngine.js src\components\City\cityJobs.js src\components\City\cityNet.js src\components\Guest\Guest.css src\components\Guest\GuestSignInSheet.jsx src\components\HouseScreen\ItemThumb.jsx src\components\HouseScreen\houseEngine.js src\components\NearbyPlayers\NearbyPlayersButton.jsx src\components\Phone\PhoneScreen.jsx src\components\Phone\borsa\BorsaApp.css src\components\Phone\borsa\BorsaApp.jsx src\components\Workshop\ModifiyeStudio.jsx src\lib\carThumb.js src\lib\forceUpdate.js"
set "YENI=docs\v191-akicilik.md docs\v192-guncelleme.md docs\v193-guncelleme.md docs\v194-ana-ekran.md src\components\City\carImpact.js src\components\Guest\GuestWelcome.jsx src\components\HouseScreen\figureFx.js src\components\HouseScreen\itemThumbs.js src\components\HouseScreen\sharedRenderer.js src\lib\goldPreview.js tests\city\_rtdbStub.mjs tests\city\car-impact.test.mjs tests\city\city-net-load.test.mjs tests\city\job-ui-rate.test.mjs tests\ui\city-hud.test.mjs"

echo.
echo ===== 1/6 yedek + yeni dosyalar =====
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
echo   Dosyalar yerinde. Eski hali: _v194\yedek

echo.
echo ===== 2/6 arayuz derleme kontrolu =====
call npm run build
if errorlevel 1 (
  echo.
  echo Arayuz derlenemedi. HICBIR SEY GONDERILMEDI. Geri almak icin geri-al-v194.bat. Ciktiyi Claude'a gonder.
  goto son
)

echo.
echo ===== 3/6 testler =====
set "TESTLER="
for %%Q in ("functions\scripts\borsa.test.mjs" "functions\scripts\borsa-deletion.test.mjs" "functions\scripts\v147-cityphoto.test.mjs" "tests\city\car-impact.test.mjs" "tests\ui\city-hud.test.mjs" "tests\ui\borsa-ui.test.mjs" "tests\ui\force-update.test.mjs" "tests\ui\tap-guard.test.mjs" "tests\ui\badge-feed.test.mjs" "tests\city\city-net-load.test.mjs" "tests\city\job-ui-rate.test.mjs" "tests\city\jobs-resume.test.mjs" "tests\city\kurye.test.mjs" "tests\city\nav-route.test.mjs") do (
  if exist "%%~Q" call set "TESTLER=%%TESTLER%% %%~Q"
)
node --test %TESTLER%
if errorlevel 1 (
  echo.
  echo Testler basarisiz. HICBIR SEY GONDERILMEDI. Geri almak icin geri-al-v194.bat. Ciktiyi Claude'a gonder.
  goto son
)

echo.
echo ===== 4/6 Firebase: borsa + sehir fotografi fonksiyonlari (ONCE sunucu, sonra site) =====
REM borsa saatlik is cronTick icinde calisir (v138) - bu yuzden cronTick de yuklenir.
set "FN=functions:borsaAction,functions:cronTick,functions:cityAction"
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
echo ===== 5/6 git commit + push (sadece v194 dosyalari) =====
set GIT_ASK_YESNO=false
git add -- functions/borsa.js functions/cityPhoto.js functions/scripts/borsa.test.mjs preview/borsa-app.jsx preview/mocks/firebase-auth.js public/neon-flags.json src/components/BankScreen/BankScreen.css src/components/City/City.css src/components/City/CityPhoto.jsx src/components/City/CityScreen.jsx src/components/City/cityEngine.js src/components/City/cityJobs.js src/components/City/cityNet.js src/components/Guest/Guest.css src/components/Guest/GuestSignInSheet.jsx src/components/HouseScreen/ItemThumb.jsx src/components/HouseScreen/houseEngine.js src/components/NearbyPlayers/NearbyPlayersButton.jsx src/components/Phone/PhoneScreen.jsx src/components/Phone/borsa/BorsaApp.css src/components/Phone/borsa/BorsaApp.jsx src/components/Workshop/ModifiyeStudio.jsx src/lib/carThumb.js src/lib/forceUpdate.js docs/v191-akicilik.md docs/v192-guncelleme.md docs/v193-guncelleme.md docs/v194-ana-ekran.md src/components/City/carImpact.js src/components/Guest/GuestWelcome.jsx src/components/HouseScreen/figureFx.js src/components/HouseScreen/itemThumbs.js src/components/HouseScreen/sharedRenderer.js src/lib/goldPreview.js tests/city/_rtdbStub.mjs tests/city/car-impact.test.mjs tests/city/city-net-load.test.mjs tests/city/job-ui-rate.test.mjs tests/ui/city-hud.test.mjs _v194/yukle-v194.bat _v194/geri-al-v194.bat
git commit -q -m "v194 (v191-v193 dahil): sade sehir ana ekrani (supheli+altin hapi, yakindakiler ust cubukta, 3D cipi, cizim araba ikonu, sohbet 2 mesaj, misafir ayni duzen), borsa geri seridi ve kisa hisse yazisi; v193 gercekci carpma ve havada suzulme, sohbet en alta, tir fotografi, sade borsa kurali; v192 direksiyon, tir gorevi kasma, RTDB maliyeti, misafir karsilama; v191 kalabalikta kasma, harita acikken atma, takilma kaydi" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_0182eo1KvnGvtzjYt9Gf2kLD"
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
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $sha=(git rev-parse HEAD).Trim(); $url='https://api.github.com/repos/cetelerinsavasi-afk/neon-sehir/commits/'+$sha+'/check-runs'; $sonuc=$null; for($i=0;$i -lt 32;$i++){ Start-Sleep -Seconds 15; try{ $r=Invoke-RestMethod -Uri $url -Headers @{'User-Agent'='neon-sehir-deploy';'Accept'='application/vnd.github+json'} }catch{ continue }; $cf=$r.check_runs | Where-Object { $_.name -like 'Workers Builds*' } | Select-Object -First 1; if(-not $cf){ Write-Host '  ...Cloudflare henuz baslamadi'; continue }; if($cf.status -ne 'completed'){ Write-Host '  ...Cloudflare derliyor'; continue }; $sonuc=$cf.conclusion; break }; Write-Host ''; if($sonuc -eq 'success'){ Write-Host 'TAMAM: v194 yayinda. Oyunu yenile (telefonda uygulamayi kapatip ac).' -ForegroundColor Green } elseif($sonuc){ Write-Host ('Cloudflare derlemesi BASARISIZ ('+$sonuc+'). Cloudflare panelinde Workers > neon-sehir > Deployments hata kaydini Claude''a gonder.') -ForegroundColor Red } else { Write-Host 'Cloudflare 8 dk icinde derlemeyi bitirmedi. Cloudflare panelinde Workers > neon-sehir > Deployments''ta son commit icin Retry build de.' -ForegroundColor Yellow }"
goto son

:yanlis
echo Bu _v194 klasoru neon-sehir klasorunun ICINDE olmali. HICBIR SEY YAPILMADI.

:son
echo.
pause
