@echo off
REM ============================================================================
REM Neon Sehir v173 - TEK TIK (bu _v173 klasoru neon-sehir klasorunun ICINDE olmali)
REM  1) Degisecek dosyalarin yedegi: _v173\yedek
REM  2) _v173\dosyalar icindekiler yerine kopyalanir
REM  3) Derleme + testler
REM  4) Firebase fonksiyonlari: prayAtMosque, buyFromVendor, applyForImam,
REM     applyFutbolManager, requestFutbolManagerHandover, gangAction, cronTick
REM  5) git commit + push (SADECE v173 dosyalari) ve Cloudflare beklenir
REM v170 + v171 + v172 dahil (onlari calistirmadiysan da bu dosya yeter). Degisenler:
REM  - ChatsApp'ta yazarken oyundan atma: telefonda yazi alanina dokununca sehir grafik
REM    bellegini birakir (klavye acilinca bellek tasmasin)
REM  - Sehirdeyken bildirim seridi / Oyuncu Karti > Mesaj artik sehrin telefonunu acar
REM    (eskiden ana sayfanin telefonu sehrin ALTINDA gorunmeden aciliyordu)
REM  - Sohbette yazarken kasma: harf yazinca sadece yazi kutusu yenilenir
REM  - Acilis / donma: golgelendirici derlemesinde bekleme yok, doku cizimi hizli,
REM    sona eren okuma olcumu kaldirildi
REM  - Sayginlik her zaman +1; imam / polis / futbol menajeri icin 10 sayginlik
REM  v171: acilistan 2-3 sn sonraki takilma (telefon dugmesi, bildirimler, dinleyiciler
REM    artik sirayla acilir; telefon dugmesi bastan yerinde), ChatsApp listesi 100 yerine
REM    1 mesaj okur (grup acilinca 100)
REM  v172: oyun verisi geldikce sehir ekrani bosuna yeniden cizilmez (akicilik)
REM  v173: acilista golgelendiriciler ilk kareden once arka planda (paralel) derlenir
REM Firestore okuma/yazma ARTMAZ. Geri donus: _v173\geri-al-v173.bat
REM ============================================================================
setlocal
set "HERE=%~dp0"
cd /d "%HERE%.."
if not exist "package.json" goto yanlis
if not exist ".git" goto yanlis
if not exist "%HERE%dosyalar\src\lib\chatsappNav.js" (
  echo _v173\dosyalar eksik. HICBIR SEY YAPILMADI.
  goto son
)

echo.
echo ===== 1/6 yedek + yeni dosyalar =====
for %%F in (functions\gang\actions\intel.js functions\gang\config.js functions\gang\test\intel.test.js functions\gang\test\v109.test.js functions\index.js src\App.jsx src\components\AvatarSvg\AvatarSvg.jsx src\components\ChatsAppScreen\DmChat.jsx src\components\ChatsAppScreen\GroupChat.jsx src\components\ChatsAppScreen\chatExtras.jsx src\components\City\CityScreen.jsx src\components\City\cityEngine.js src\components\FutbolScreen\FutbolMenajerOl.jsx src\components\Gangs\PoliceApplySheet.jsx src\components\Gangs\gangConstants.js src\components\GuideScreen\guideContent.js src\components\HouseScreen\houseEngine.js src\components\HouseScreen\houseTextures.js src\components\ImamBooklet\ImamBooklet.jsx src\components\ManagerBooklet\ManagerBooklet.jsx src\components\MekanlarScreen\SuspicionTab.jsx src\components\MosqueScreen\MosqueScreen.jsx src\components\PoliceApplicationSection\PoliceApplicationSection.jsx src\components\PoliceBooklet\PoliceBooklet.jsx src\lib\chatsappNav.js vite.config.js src\lib\bootStage.js src\components\ChatsAppScreen\ChatsAppScreen.jsx) do (
  if exist "%%F" if not exist "%HERE%yedek\%%F" xcopy "%%F" "%HERE%yedek\%%F*" /Y /Q >nul
)
xcopy "%HERE%dosyalar\*" "%CD%" /E /Y /I /Q >nul
if errorlevel 1 (
  echo Dosyalar kopyalanamadi. HICBIR SEY GONDERILMEDI. Ciktiyi Claude'a gonder.
  goto son
)
echo   Dosyalar yerinde. Eski hali: _v173\yedek

echo.
echo ===== 2/6 arayuz derleme kontrolu =====
call npm run build
if errorlevel 1 (
  echo.
  echo Arayuz derlenemedi. HICBIR SEY GONDERILMEDI. Geri almak icin geri-al-v173.bat. Ciktiyi Claude'a gonder.
  goto son
)

echo.
echo ===== 3/6 testler =====
node --test tests\webview\webview.test.mjs tests\city\jobs-resume.test.mjs tests\city\kurye.test.mjs tests\city\nav-route.test.mjs tests\clock\clock-sync.test.mjs tests\clock\server-clock.test.mjs tests\cost\daily-gate.test.mjs functions\scripts\onboarding.test.mjs functions\scripts\futbolPro.test.mjs functions\gang\test\intel.test.js functions\gang\test\v109.test.js functions\gang\test\membership.test.js
if errorlevel 1 (
  echo.
  echo Testler basarisiz. HICBIR SEY GONDERILMEDI. Ciktiyi Claude'a gonder.
  goto son
)

echo.
echo ===== 4/6 Firebase fonksiyonlari =====
set "FN=functions:prayAtMosque,functions:buyFromVendor,functions:applyForImam,functions:applyFutbolManager,functions:requestFutbolManagerHandover,functions:gangAction,functions:cronTick"
call firebase deploy --only %FN%
if errorlevel 1 (
  echo.
  echo Ilk deneme basarisiz - 20 sn sonra bir kez daha deneniyor...
  timeout /t 20 /nobreak >nul
  call firebase deploy --only %FN%
  if errorlevel 1 (
    echo.
    echo Fonksiyonlar yuklenemedi. git push YAPILMADI ^(site degismedi^). Bu dosyayi tekrar calistir; olmazsa ciktiyi Claude'a gonder.
    goto son
  )
)

echo.
echo ===== 5/6 git commit + push (sadece v173 dosyalari) =====
set GIT_ASK_YESNO=false
git add -- functions/gang/actions/intel.js functions/gang/config.js functions/gang/test/intel.test.js functions/gang/test/v109.test.js functions/index.js src/App.jsx src/components/AvatarSvg/AvatarSvg.jsx src/components/ChatsAppScreen/DmChat.jsx src/components/ChatsAppScreen/GroupChat.jsx src/components/ChatsAppScreen/chatExtras.jsx src/components/City/CityScreen.jsx src/components/City/cityEngine.js src/components/FutbolScreen/FutbolMenajerOl.jsx src/components/Gangs/PoliceApplySheet.jsx src/components/Gangs/gangConstants.js src/components/GuideScreen/guideContent.js src/components/HouseScreen/houseEngine.js src/components/HouseScreen/houseTextures.js src/components/ImamBooklet/ImamBooklet.jsx src/components/ManagerBooklet/ManagerBooklet.jsx src/components/MekanlarScreen/SuspicionTab.jsx src/components/MosqueScreen/MosqueScreen.jsx src/components/PoliceApplicationSection/PoliceApplicationSection.jsx src/components/PoliceBooklet/PoliceBooklet.jsx src/lib/chatsappNav.js vite.config.js  src/lib/bootStage.js src/components/ChatsAppScreen/ChatsAppScreen.jsx _v173/yukle-v173.bat _v173/geri-al-v173.bat
git commit -q -m "v173 (v170-v172 dahil): acilista golgelendiriciler arka planda derlenir; v172: sehir ekrani gereksiz yeniden cizilmez; v171: acilis 2. asama takilmasi, ChatsApp listesi 1 mesaj okur; v170: ChatsApp yazarken oyundan atma, sehirde gizli telefon, sohbet kasmasi, sayginlik +1 ve meslekler 10" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_0182eo1J1A8nPfYpmAj1sSuy"
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
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $sha=(git rev-parse HEAD).Trim(); $url='https://api.github.com/repos/cetelerinsavasi-afk/neon-sehir/commits/'+$sha+'/check-runs'; $sonuc=$null; for($i=0;$i -lt 32;$i++){ Start-Sleep -Seconds 15; try{ $r=Invoke-RestMethod -Uri $url -Headers @{'User-Agent'='neon-sehir-deploy';'Accept'='application/vnd.github+json'} }catch{ continue }; $cf=$r.check_runs | Where-Object { $_.name -like 'Workers Builds*' } | Select-Object -First 1; if(-not $cf){ Write-Host '  ...Cloudflare henuz baslamadi'; continue }; if($cf.status -ne 'completed'){ Write-Host '  ...Cloudflare derliyor'; continue }; $sonuc=$cf.conclusion; break }; Write-Host ''; if($sonuc -eq 'success'){ Write-Host 'TAMAM: v173 yayinda. Oyunu yenile (telefonda uygulamayi kapatip ac).' -ForegroundColor Green } elseif($sonuc){ Write-Host ('Cloudflare derlemesi BASARISIZ ('+$sonuc+'). Cloudflare panelinde Workers > neon-sehir > Deployments hata kaydini Claude''a gonder.') -ForegroundColor Red } else { Write-Host 'Cloudflare 8 dk icinde derlemeyi bitirmedi. Cloudflare panelinde Workers > neon-sehir > Deployments''ta son commit icin Retry build de.' -ForegroundColor Yellow }"
goto son

:yanlis
echo Bu _v173 klasoru neon-sehir klasorunun ICINDE olmali. HICBIR SEY YAPILMADI.

:son
echo.
pause
