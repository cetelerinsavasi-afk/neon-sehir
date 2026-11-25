@echo off
REM ============================================================================
REM Neon Sehir v204 - DEPLOY + PUSH
REM   - Firestore maliyeti: soygun panosu sadece acik planlari okur; Neon Sehir
REM     sohbeti 10 mesajla, birebir sohbet 20 mesajla acilir (eskiler kaydirinca);
REM     ana sayfa "Makineleri calistir" hatirlatmasi makineleri canli dinlemez;
REM     kredi / fabrika degeri makineleri tek tek okumak yerine sayar.
REM   - Spor salonu mini oyunlari dogru boyutta; banyo mobilyalarinda altin yerine siyah.
REM Adimlar:
REM   1) v203 gonderilmis mi kontrol (gonderilmediyse once deploy-v203.bat)
REM   2) arayuzu derler + TUM testleri calistirir (hata varsa HICBIR SEY gonderilmez)
REM   3) Firebase: SADECE 6 fonksiyon (kredi + fabrika). Kurallar / diger fonksiyonlar YUKLENMEZ.
REM      + eski, artik kullanilmayan 3 fonksiyon silinir (presenceInteriorIn/Out, presenceParkIn)
REM   4) git: sadece bu isin dosyalari commit + push (Cloudflare siteyi kendisi derler)
REM   5) Cloudflare derlemesini bekler
REM Geri alma: geri-al-v204.bat
REM ============================================================================
setlocal EnableExtensions
cd /d "%~dp0"
if not exist "package.json" goto yanlis
if not exist ".git" goto yanlis

set "MSG=v204: Firestore okuma azaltma (soygun panosu sadece acik planlar, sohbet 10 / DM 20 mesajla acilir, makine hatirlatmasi tek belge, kredi makineleri sayar); spor salonu mini oyun boyutu; banyo mobilyalari siyah"

set "V203="
for /f %%C in ('git log --format^=%%h -n 1 --fixed-strings --grep^="v203: profilde"') do set "V203=%%C"
if not defined V203 (
  echo v203 henuz gonderilmemis gorunuyor. Once deploy-v203.bat calistir, sonra bunu. HICBIR SEY YAPILMADI.
  goto son
)

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
echo ===== 3/5 Firebase: 6 fonksiyon (once sunucu, sonra site) =====
set "FNS=functions:getCreditInfo,functions:takeCredit,functions:getFactoryValue,functions:buyFactoryMachine,functions:triggerAllMining,functions:runFactoryMachines"
call firebase deploy --only %FNS%
if errorlevel 1 (
  echo Ilk deneme basarisiz - 30 sn sonra bir kez daha...
  timeout /t 30 /nobreak >nul
  call firebase deploy --only %FNS%
  if errorlevel 1 (
    echo Firebase yuklenemedi. git push YAPILMADI ^(site degismedi^). Ciktiyi Claude'a gonder.
    goto son
  )
)
echo Eski kullanilmayan fonksiyonlar siliniyor (hata verirse onemli degil, devam edilir)...
call firebase functions:delete presenceInteriorIn presenceInteriorOut presenceParkIn --region europe-west1 --force

echo.
echo ===== 4/5 git commit + push =====
set GIT_ASK_YESNO=false
git add -- functions/index.js functions/scripts/credit.test.mjs src/hooks/useOpenHeistPlans.js src/hooks/useGlobalChat.js src/hooks/useMyFactory.js src/hooks/useOnboarding.js src/components/ChatsAppScreen/GroupChat.jsx src/components/ChatsAppScreen/DmChat.jsx src/components/ChatsAppScreen/ChatsAppScreen.css src/components/Venue3D/venueGameParts.jsx src/components/HouseScreen/houseCatalog.js tests/ui/v204.test.mjs docs/v204-guncelleme.md deploy-v204.bat geri-al-v204.bat
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
echo ===== 5/5 Cloudflare derlemesi bekleniyor (en fazla ~8 dk) =====
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $sha=(git rev-parse HEAD).Trim(); $url='https://api.github.com/repos/cetelerinsavasi-afk/neon-sehir/commits/'+$sha+'/check-runs'; $sonuc=$null; for($i=0;$i -lt 32;$i++){ Start-Sleep -Seconds 15; try{ $r=Invoke-RestMethod -Uri $url -Headers @{'User-Agent'='neon-sehir-deploy';'Accept'='application/vnd.github+json'} }catch{ continue }; $cf=$r.check_runs | Where-Object { $_.name -like 'Workers Builds*' } | Select-Object -First 1; if(-not $cf){ Write-Host '  ...Cloudflare henuz baslamadi'; continue }; if($cf.status -ne 'completed'){ Write-Host '  ...Cloudflare derliyor'; continue }; $sonuc=$cf.conclusion; break }; Write-Host ''; if($sonuc -eq 'success'){ Write-Host 'TAMAM: yeni surum yayinda. Oyunu yenile (telefonda uygulamayi kapatip ac).' -ForegroundColor Green } elseif($sonuc){ Write-Host ('Cloudflare derlemesi BASARISIZ ('+$sonuc+'). Cloudflare panelinde Workers > neon-sehir > Deployments hata kaydini Claude''a gonder.') -ForegroundColor Red } else { Write-Host 'Cloudflare 8 dk icinde derlemeyi bitirmedi. Cloudflare panelinde Workers > neon-sehir > Deployments''ta son commit icin Retry build de.' -ForegroundColor Yellow }"
goto son

:yanlis
echo Bu dosya neon-sehir klasorunun ICINDE olmali (package.json ve .git ile ayni yerde). HICBIR SEY YAPILMADI.

:son
echo.
pause
