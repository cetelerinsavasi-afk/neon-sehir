@echo off
REM ============================================================================
REM Neon Sehir - DEPLOY + PUSH (her surumde ayni dosya kullanilir)
REM   1) eski gereksiz dosyalari temizler (_vNNN paket klasorleri, eski aab/apk, gecici dosyalar)
REM   2) arayuzu derler + testleri calistirir (hata varsa HICBIR SEY gonderilmez)
REM   3) Firebase fonksiyonlari (once sunucu)
REM   4) git commit + push (Cloudflare siteyi kendisi derler)
REM   5) Cloudflare derlemesini bekler
REM Kullanim: deploy-push.bat            -> varsayilan commit mesaji
REM           deploy-push.bat "mesaj"    -> kendi commit mesajin
REM ============================================================================
setlocal EnableExtensions
cd /d "%~dp0"
if not exist "package.json" goto yanlis
if not exist ".git" goto yanlis

set "MSG=%~1"
if "%MSG%"=="" set "MSG=v202: satis vergileri fiyata ekleniyor (araba/silah/motor/modifiye/spor/tamirci/ticari arac), sirket ve hisse vergisi kaldirildi; soygun ekibi icin 1/10 guc; ev mobilyalari (TV, somine, dus, isiklar), ev bot/hayvan duzenleme; camide dilenciler; elmas esikleri; internet kafe sayaci + koltuk kilidi; grafiti titremesi; PC modifiye sekmeleri; mafya saygisi kaldirildi; acilis hizlandirma"

echo.
echo ===== 1/6 gereksiz dosyalar temizleniyor =====
for /d %%D in (_v1* _v2*) do (
  echo   siliniyor: %%D
  rd /s /q "%%D"
)
if exist "_belediye_is" rd /s /q "_belediye_is"
if exist ".wrangler\tmp" rd /s /q ".wrangler\tmp"
if exist "android\neon-cokme2.txt" del /q "android\neon-cokme2.txt"
if exist "android\NeonSehir-v13.aab" del /q "android\NeonSehir-v13.aab"
if exist "android\app-release-unsigned-aligned.apk" del /q "android\app-release-unsigned-aligned.apk"
if exist "android-webview\NeonSehir-webview-v14.aab" del /q "android-webview\NeonSehir-webview-v14.aab"
if exist "android-webview\NeonSehir-webview-v15.aab" del /q "android-webview\NeonSehir-webview-v15.aab"
echo   Temizlik tamam (imza anahtarlari, son aab/apk ve kaynak dosyalar duruyor).

echo.
echo ===== 2/6 arayuz derleme kontrolu =====
call npm run build
if errorlevel 1 (
  echo.
  echo Arayuz derlenemedi. HICBIR SEY GONDERILMEDI. Ciktiyi Claude'a gonder.
  goto son
)

echo.
echo ===== 3/6 testler =====
call npm --prefix functions test
if errorlevel 1 (
  echo.
  echo Sunucu testleri basarisiz. HICBIR SEY GONDERILMEDI. Ciktiyi Claude'a gonder.
  goto son
)
node --test "tests/ui/*.test.mjs" "tests/city/*.test.mjs" "tests/cost/*.test.mjs" "tests/clock/*.test.mjs"
if errorlevel 1 (
  echo.
  echo Arayuz testleri basarisiz. HICBIR SEY GONDERILMEDI. Ciktiyi Claude'a gonder.
  goto son
)

echo.
echo ===== 4/6 Firebase: fonksiyonlar + RTDB kurallari (ONCE sunucu, sonra site) =====
REM Silinecek fonksiyon / indeks sorarsa N de.
call firebase deploy --only functions,database
if errorlevel 1 (
  echo Ilk deneme basarisiz - 30 sn sonra bir kez daha...
  timeout /t 30 /nobreak >nul
  call firebase deploy --only functions,database
  if errorlevel 1 (
    echo Firebase yuklenemedi. git push YAPILMADI ^(site degismedi^). Ciktiyi Claude'a gonder.
    goto son
  )
)

echo.
echo ===== 5/6 git commit + push =====
set GIT_ASK_YESNO=false
git add -u
git add -A -- src functions public docs tests scripts index.html package.json vite.config.js firebase.json firestore.rules firestore.indexes.json database.rules.json .gitignore deploy-push.bat
git diff --cached --quiet
if not errorlevel 1 (
  echo Gonderilecek degisiklik yok - commit atlandi.
  goto bekle
)
git commit -q -m "%MSG%" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01YQymXM9wLHJd49xfmi2jb9"
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
echo ===== 6/6 Cloudflare derlemesi bekleniyor (en fazla ~8 dk) =====
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $sha=(git rev-parse HEAD).Trim(); $url='https://api.github.com/repos/cetelerinsavasi-afk/neon-sehir/commits/'+$sha+'/check-runs'; $sonuc=$null; for($i=0;$i -lt 32;$i++){ Start-Sleep -Seconds 15; try{ $r=Invoke-RestMethod -Uri $url -Headers @{'User-Agent'='neon-sehir-deploy';'Accept'='application/vnd.github+json'} }catch{ continue }; $cf=$r.check_runs | Where-Object { $_.name -like 'Workers Builds*' } | Select-Object -First 1; if(-not $cf){ Write-Host '  ...Cloudflare henuz baslamadi'; continue }; if($cf.status -ne 'completed'){ Write-Host '  ...Cloudflare derliyor'; continue }; $sonuc=$cf.conclusion; break }; Write-Host ''; if($sonuc -eq 'success'){ Write-Host 'TAMAM: yeni surum yayinda. Oyunu yenile (telefonda uygulamayi kapatip ac).' -ForegroundColor Green } elseif($sonuc){ Write-Host ('Cloudflare derlemesi BASARISIZ ('+$sonuc+'). Cloudflare panelinde Workers > neon-sehir > Deployments hata kaydini Claude''a gonder.') -ForegroundColor Red } else { Write-Host 'Cloudflare 8 dk icinde derlemeyi bitirmedi. Cloudflare panelinde Workers > neon-sehir > Deployments''ta son commit icin Retry build de.' -ForegroundColor Yellow }"
goto son

:yanlis
echo Bu dosya neon-sehir klasorunun ICINDE olmali (package.json ve .git ile ayni yerde). HICBIR SEY YAPILMADI.

:son
echo.
pause
