@echo off
REM ============================================================================
REM Neon Sehir v165 - MALIYET (1. adim) - TEK TIK
REM   - Ortak saat artik Realtime Database baglantisindan (serverTime fonksiyonu
REM     sadece yedek). Acilis daha hizli, fonksiyon cagrisi / soguk baslatma yok.
REM   - Futbol ekrani bitmis tek seferlik duzeltmeyi artik her acilista cagirmiyor.
REM   - Fabrika ekrani 00:00 yedegini cihaz basina gunde 1 kez cagiriyor
REM     (00:00-00:20 arasi eskisi gibi her acilista).
REM   - GECICI OLCUM: oturumlarin ~%10'unda Firestore okumalari dinleyici bazinda
REM     sayilir, ~10 dk'da bir clientReadStats fonksiyonuna (sadece log) gider.
REM     21 Kasim 00:00'da kendiliginden kapanir. Hemen kapatmak: olcum-kapat.bat
REM Yuklenen Firebase fonksiyonu: SADECE clientReadStats (YENI). Diger fonksiyonlar,
REM firestore.rules, database.rules.json, indeksler DEGISMEZ.
REM Geri donus: geri-al-v165.bat
REM Calistirma: bu dosyaya cift tikla (neon-sehir klasorunun icinde olmali).
REM ============================================================================
setlocal
cd /d "%~dp0"
if not exist "package.json" goto yanlis
if not exist ".git" goto yanlis
if not exist "src\lib\fsMeter\firestoreShim.js" (
  echo v165 dosyalari bulunamadi ^(src\lib\fsMeter\firestoreShim.js yok^). HICBIR SEY YAPILMADI.
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

echo.
echo ===== 2/5 testler =====
set "TESTLER="
for %%T in ("tests\webview\webview.test.mjs" "tests\city\jobs-resume.test.mjs" "tests\city\kurye.test.mjs" "tests\city\nav-route.test.mjs" "functions\scripts\six-image.test.mjs" "functions\scripts\read-stats.test.mjs" "tests\clock\clock-sync.test.mjs" "tests\clock\server-clock.test.mjs" "tests\cost\daily-gate.test.mjs" "tests\cost\fs-meter.test.mjs" "tests\cost\fs-shim-off.test.mjs" "tests\cost\fs-shim-on.test.mjs") do (
  if exist "%%~T" call set "TESTLER=%%TESTLER%% %%~T"
)
node --test %TESTLER%
if errorlevel 1 (
  echo.
  echo Testler basarisiz. HICBIR SEY GONDERILMEDI. Ciktiyi Claude'a gonder.
  goto son
)

echo.
echo ===== 3/5 Firebase: SADECE yeni clientReadStats fonksiyonu (olcum, sadece log yazar) =====
call firebase deploy --only functions:clientReadStats
if errorlevel 1 (
  echo.
  echo Firebase fonksiyon yuklemesi basarisiz. Site GONDERILMEDI. Ciktiyi Claude'a gonder.
  echo ^(Giris istiyorsa once: firebase login^)
  goto son
)

echo.
echo ===== 4/5 git commit + push =====
set GIT_ASK_YESNO=false
git add -- functions/index.js functions/readStats.js functions/scripts/read-stats.test.mjs src/lib/serverClock.js src/lib/serverClockSync.js src/lib/clockSync.js src/lib/dailyGate.js src/lib/fsMeter/meter.js src/lib/fsMeter/runtime.js src/lib/fsMeter/firestoreShim.js src/components/FactoryScreen/FactoryScreen.jsx src/components/FutbolScreen/FutbolLigler.jsx vite.config.js public/neon-flags.json tests/clock/clock-sync.test.mjs tests/clock/server-clock.test.mjs tests/cost/daily-gate.test.mjs tests/cost/fs-meter.test.mjs tests/cost/fs-shim-off.test.mjs tests/cost/fs-shim-on.test.mjs tests/cost/fakeFirestore.mjs deploy-v165.bat geri-al-v165.bat olcum-kapat.bat docs/v165-maliyet.md
git commit -q -m "v165: maliyet 1. adim - ortak saat RTDB baglantisindan (serverTime yedek), bitmis futbol duzeltmesi istemciden cagrilmiyor, fabrika 00:00 yedegi cihaz basina gunde 1 (00:00-00:20 her acilis), gecici okuma olcumu (%10 oturum, clientReadStats -> log, 21 Kasim'da biter)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01YQymXLfuqypT5Lmg1cpqMz"
if errorlevel 1 (
  echo.
  echo git commit basarisiz ^(belki degisiklik yok ya da zaten commit edildi^). Ciktiyi Claude'a gonder.
  goto son
)
git push
if errorlevel 1 (
  echo.
  echo git push basarisiz. Site gonderilmedi ^(fonksiyon yuklendi ama kimse cagirmiyor, zararsiz^). Ciktiyi Claude'a gonder.
  goto son
)

echo.
echo ===== 5/5 Cloudflare derlemesi bekleniyor (en fazla ~8 dk) =====
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $sha=(git rev-parse HEAD).Trim(); $url='https://api.github.com/repos/cetelerinsavasi-afk/neon-sehir/commits/'+$sha+'/check-runs'; $sonuc=$null; for($i=0;$i -lt 32;$i++){ Start-Sleep -Seconds 15; try{ $r=Invoke-RestMethod -Uri $url -Headers @{'User-Agent'='neon-sehir-deploy';'Accept'='application/vnd.github+json'} }catch{ continue }; $cf=$r.check_runs | Where-Object { $_.name -like 'Workers Builds*' } | Select-Object -First 1; if(-not $cf){ Write-Host '  ...Cloudflare henuz baslamadi'; continue }; if($cf.status -ne 'completed'){ Write-Host '  ...Cloudflare derliyor'; continue }; $sonuc=$cf.conclusion; break }; Write-Host ''; if($sonuc -eq 'success'){ Write-Host 'TAMAM: v165 yayinda. Kontrol listesi: docs\v165-maliyet.md' -ForegroundColor Green } elseif($sonuc){ Write-Host ('Cloudflare derlemesi BASARISIZ ('+$sonuc+'). Cloudflare panelinde Workers > neon-sehir > Deployments hata kaydini Claude''a gonder.') -ForegroundColor Red } else { Write-Host 'Cloudflare 8 dk icinde derlemeyi bitirmedi. Cloudflare panelinde Workers > neon-sehir > Deployments''ta son commit icin Retry build de.' -ForegroundColor Yellow }"
goto son

:yanlis
echo Bu dosya neon-sehir proje klasorunun ICINDE olmali. HICBIR SEY YAPILMADI.

:son
echo.
pause
