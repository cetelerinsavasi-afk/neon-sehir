@echo off
REM ============================================================================
REM Neon Sehir v205 - DEPLOY + PUSH (SADECE SITE, sunucu fonksiyonu degismedi)
REM   - Futbol: mac saati (17:55-19:30) disinda lig fiksturu, kupa maclari ve
REM     istatistik tablolari bir kez okunup cihazda saklanir (0 okuma ile acilir);
REM     mac saatinde eskisi gibi canli.
REM   - Ana sayfa hatirlatmalari futbolu canli dinlemez (takim bilgisi gunde 1 kez,
REM     takimi olana sadece takim belgesi). Futbol ekrani kapaninca bilgi tazelenir.
REM Adimlar: derleme + TUM testler -> git commit + push -> Cloudflare beklenir
REM Geri alma: geri-al-v205.bat
REM ============================================================================
setlocal EnableExtensions
cd /d "%~dp0"
if not exist "package.json" goto yanlis
if not exist ".git" goto yanlis

set "MSG=v205: futbol verisi mac saati disinda cihazdan (fikstur/kupa/istatistik), ana sayfa futbol dinleyicileri hafif (gunde 1 okuma, takima 1 belge)"

set "V204="
for /f %%C in ('git log --format^=%%h -n 1 --fixed-strings --grep^="v204: Firestore"') do set "V204=%%C"
if not defined V204 (
  echo v204 henuz gonderilmemis gorunuyor. Once deploy-v204.bat calistir. HICBIR SEY YAPILMADI.
  goto son
)

echo.
echo ===== 1/4 arayuz derleme =====
call npm run build
if errorlevel 1 (
  echo.
  echo Arayuz derlenemedi. HICBIR SEY GONDERILMEDI. Ciktiyi Claude'a gonder.
  goto son
)

echo.
echo ===== 2/4 testler =====
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
echo ===== 3/4 git commit + push (Firebase'e bir sey yuklenmez) =====
set GIT_ASK_YESNO=false
git add -- src/lib/futbolSmartQuery.js src/hooks/useFutbolLite.js src/hooks/useFutbolMatches.js src/hooks/useFutbolCup.js src/hooks/useFutbolPro.js src/hooks/useOnboarding.js src/hooks/useBizReminders.js src/components/FutbolScreen/FutbolFullScreen.jsx tests/ui/v205.test.mjs docs/v205-guncelleme.md deploy-v205.bat geri-al-v205.bat
git diff --cached --name-only | findstr /i /r "keystore \.jks$ \.keystore$ local\.properties \.aab$ \.env$" >nul
if not errorlevel 1 (
  echo GIZLI DOSYA commit'e girmek uzere! Hicbir sey gonderilmedi.
  git reset -q
  goto son
)
git diff --cached --quiet
if not errorlevel 1 (
  echo Gonderilecek degisiklik yok - commit atlandi.
  goto bekle
)
git commit -q -m "%MSG%" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01YQymXPd4HspokieFEq7Kti"
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
echo ===== 4/4 Cloudflare derlemesi bekleniyor (en fazla ~8 dk) =====
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $sha=(git rev-parse HEAD).Trim(); $url='https://api.github.com/repos/cetelerinsavasi-afk/neon-sehir/commits/'+$sha+'/check-runs'; $sonuc=$null; for($i=0;$i -lt 32;$i++){ Start-Sleep -Seconds 15; try{ $r=Invoke-RestMethod -Uri $url -Headers @{'User-Agent'='neon-sehir-deploy';'Accept'='application/vnd.github+json'} }catch{ continue }; $cf=$r.check_runs | Where-Object { $_.name -like 'Workers Builds*' } | Select-Object -First 1; if(-not $cf){ Write-Host '  ...Cloudflare henuz baslamadi'; continue }; if($cf.status -ne 'completed'){ Write-Host '  ...Cloudflare derliyor'; continue }; $sonuc=$cf.conclusion; break }; Write-Host ''; if($sonuc -eq 'success'){ Write-Host 'TAMAM: yeni surum yayinda. Oyunu yenile (telefonda uygulamayi kapatip ac).' -ForegroundColor Green } elseif($sonuc){ Write-Host ('Cloudflare derlemesi BASARISIZ ('+$sonuc+'). Cloudflare panelinde Workers > neon-sehir > Deployments hata kaydini Claude''a gonder.') -ForegroundColor Red } else { Write-Host 'Cloudflare 8 dk icinde derlemeyi bitirmedi. Cloudflare panelinde Workers > neon-sehir > Deployments''ta son commit icin Retry build de.' -ForegroundColor Yellow }"
goto son

:yanlis
echo Bu dosya neon-sehir klasorunun ICINDE olmali (package.json ve .git ile ayni yerde). HICBIR SEY YAPILMADI.

:son
echo.
pause
