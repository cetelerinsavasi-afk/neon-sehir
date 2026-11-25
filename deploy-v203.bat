@echo off
REM ============================================================================
REM Neon Sehir v203 (Android v18 / 1.3.1) - DEPLOY + PUSH
REM   - Davet Et (paylas) butonu, Oyunu Degerlendir butonu (sadece Android)
REM   - Yaris: araba basina bahis siniri (galeri fiyatinin 1/10'u)
REM Adimlar:
REM   1) arayuzu derler + TUM testleri calistirir (hata varsa HICBIR SEY gonderilmez)
REM   2) Firebase: SADECE iki yaris fonksiyonu (createRaceRoom, joinRaceRoom).
REM      Kurallar (firestore/database) ve diger fonksiyonlar YUKLENMEZ.
REM   3) git: sadece bu isin dosyalari commit + push (Cloudflare siteyi kendisi derler)
REM   4) Cloudflare derlemesini bekler
REM Geri alma: geri-al-v203.bat
REM ============================================================================
setlocal EnableExtensions
cd /d "%~dp0"
if not exist "package.json" goto yanlis
if not exist ".git" goto yanlis

set "MSG=v203: profilde Arkadasini Davet Et (paylas) butonu, telefondaki Neon Sehir uygulamasinda Oyunu Degerlendir (sadece Android, odulsuz), yarista araba basina bahis siniri (galeri fiyatinin 1/10'u); Android v18 / 1.3.1 shareText"

echo.
echo ===== 1/5 arayuz derleme =====
call npm run build
if errorlevel 1 (
  echo.
  echo Arayuz derlenemedi. HICBIR SEY GONDERILMEDI. Ciktiyi Claude'a gonder.
  goto son
)

echo.
echo ===== 2/5 testler =====
call npm --prefix functions test
if errorlevel 1 (
  echo.
  echo Sunucu testleri basarisiz. HICBIR SEY GONDERILMEDI. Ciktiyi Claude'a gonder.
  goto son
)
node --test "tests/ui/*.test.mjs" "tests/city/*.test.mjs" "tests/cost/*.test.mjs" "tests/clock/*.test.mjs" "tests/webview/*.test.mjs"
if errorlevel 1 (
  echo.
  echo Arayuz testleri basarisiz. HICBIR SEY GONDERILMEDI. Ciktiyi Claude'a gonder.
  goto son
)

echo.
echo ===== 3/5 Firebase: SADECE createRaceRoom + joinRaceRoom (once sunucu, sonra site) =====
call firebase deploy --only functions:createRaceRoom,functions:joinRaceRoom
if errorlevel 1 (
  echo Ilk deneme basarisiz - 30 sn sonra bir kez daha...
  timeout /t 30 /nobreak >nul
  call firebase deploy --only functions:createRaceRoom,functions:joinRaceRoom
  if errorlevel 1 (
    echo Firebase yuklenemedi. git push YAPILMADI ^(site degismedi^). Ciktiyi Claude'a gonder.
    goto son
  )
)

echo.
echo ===== 4/5 git commit + push =====
set GIT_ASK_YESNO=false
git add -- functions/index.js functions/raceBetCap.js src/lib/shareInvite.js src/lib/nativeBridge.js src/components/HomeScreen/HomeScreen.jsx src/components/HomeScreen/HomeScreen.css src/components/GuideScreen/GuideScreen.jsx src/components/GuideScreen/GuideScreen.css src/components/RaceTrackScreen/RaceLobby.jsx tests/ui/v203-race-cap.test.mjs tests/webview/v18-share.test.mjs tests/webview/env.mjs tests/webview/probe.mjs android-webview/app/src/main/java/com/cetelerinsavasi/twa/NeonBridge.kt android-webview/app/build.gradle.kts android-webview/SURUM-NOTU.txt deploy-v203.bat geri-al-v203.bat
REM Gizli dosya kontrolu: imza anahtari / sifre dosyasi commit'e girmesin
git diff --cached --name-only | findstr /i /r "keystore \.jks$ \.keystore$ local\.properties \.aab$ \.env$" >nul
if not errorlevel 1 (
  echo GIZLI DOSYA commit'e girmek uzere! Hicbir sey gonderilmedi.
  git diff --cached --name-only | findstr /i /r "keystore \.jks$ \.keystore$ local\.properties \.aab$ \.env$"
  git reset -q
  goto son
)
git diff --cached --quiet
if not errorlevel 1 (
  echo Gonderilecek degisiklik yok - commit atlandi.
  goto bekle
)
git commit -q -m "%MSG%" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_0182eo1J1Q2NUwrQPGTmWqwZ"
if errorlevel 1 (
  echo git commit basarisiz. Ciktiyi Claude'a gonder.
  goto son
)
git push
if errorlevel 1 (
  echo git push basarisiz. Ciktiyi Claude'a gonder.
  goto son
)

:bekle
echo.
echo ===== 5/5 Cloudflare derlemesi bekleniyor (en fazla ~8 dk) =====
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $sha=(git rev-parse HEAD).Trim(); $url='https://api.github.com/repos/cetelerinsavasi-afk/neon-sehir/commits/'+$sha+'/check-runs'; $sonuc=$null; for($i=0;$i -lt 32;$i++){ Start-Sleep -Seconds 15; try{ $r=Invoke-RestMethod -Uri $url -Headers @{'User-Agent'='neon-sehir-deploy';'Accept'='application/vnd.github+json'} }catch{ continue }; $cf=$r.check_runs | Where-Object { $_.name -like 'Workers Builds*' } | Select-Object -First 1; if(-not $cf){ Write-Host '  ...Cloudflare henuz baslamadi'; continue }; if($cf.status -ne 'completed'){ Write-Host '  ...Cloudflare derliyor'; continue }; $sonuc=$cf.conclusion; break }; Write-Host ''; if($sonuc -eq 'success'){ Write-Host 'TAMAM: yeni surum yayinda. Oyunu yenile (telefonda uygulamayi kapatip ac).' -ForegroundColor Green } elseif($sonuc){ Write-Host ('Cloudflare derlemesi BASARISIZ ('+$sonuc+'). Cloudflare panelinde Workers > neon-sehir > Deployments hata kaydini Claude''a gonder.') -ForegroundColor Red } else { Write-Host 'Cloudflare 8 dk icinde derlemeyi bitirmedi. Cloudflare panelinde Workers > neon-sehir > Deployments''ta son commit icin Retry build de.' -ForegroundColor Yellow }"
goto son

:yanlis
echo Bu dosya neon-sehir klasorunun ICINDE olmali (package.json ve .git ile ayni yerde). HICBIR SEY YAPILMADI.

:son
echo.
pause
