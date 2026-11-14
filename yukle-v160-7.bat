@echo off
REM ============================================================================
REM Neon Sehir v160.7 - TEK TIK: eski artiklari temizler, derler, test eder,
REM commit + push eder (Cloudflare siteyi kendisi derler) ve derlemenin sonucunu bekler.
REM   - Soygun videosu: Gec / ses dugmeleri telefonda calisiyor, sonuc SMS'i video bitince gelir
REM   - Ceteler > Savas: pencere acikken ustteki bosluga dokununca geri (iPhone)
REM   - Sixtagram: telefonda eski fotograflar "gostermek icin dokun" ile acilir (cokmeden)
REM Bu surumde Firebase fonksiyonu / veritabani kurali DEGISMEDI - sadece site.
REM Calistirma: bu dosyaya cift tikla (neon-sehir klasorunun icinde olmali).
REM ============================================================================
setlocal
cd /d "%~dp0"
if not exist "package.json" goto yanlis
if not exist "src\components\City\cityEngine.js" goto yanlis
if not exist ".git" goto yanlis
if not exist "src\lib\notifHold.js" (
  echo v160.7 dosyalari bulunamadi ^(src\lib\notifHold.js yok^). HICBIR SEY YAPILMADI.
  goto son
)

echo.
echo ===== eski guncelleme artiklari siliniyor =====
for %%D in ("dosyalar" "v160-1" "v160-2" "_yedek-v160-5" "_yedek-v160-6") do (
  if exist "%%~D\" (
    rmdir /s /q "%%~D"
    echo   silindi: %%~D
  )
)
for %%F in ("deploy-parcali.ps1") do (
  if exist "%%~F" (
    del /q "%%~F"
    echo   silindi: %%~F
  )
)
REM git'te kayitliysa silinmeleri de commit'e girsin (kayitli degilse sessizce gecer)
git rm -r -q --cached --ignore-unmatch -- dosyalar v160-1 v160-2 _yedek-v160-5 _yedek-v160-6 deploy-parcali.ps1 >nul 2>&1

echo.
echo ===== arayuz derleme kontrolu =====
call npm run build
if errorlevel 1 (
  echo.
  echo Arayuz derlenemedi. HICBIR SEY YUKLENMEDI. Ciktiyi Claude'a gonder.
  goto son
)

echo.
echo ===== testler =====
set "TESTLER="
for %%T in ("tests\webview\webview.test.mjs" "tests\city\jobs-resume.test.mjs" "tests\city\kurye.test.mjs" "tests\city\nav-route.test.mjs" "functions\scripts\six-image.test.mjs") do (
  if exist "%%~T" call set "TESTLER=%%TESTLER%% %%~T"
)
if defined TESTLER (
  node --test %TESTLER%
  if errorlevel 1 (
    echo.
    echo Testler basarisiz. HICBIR SEY YUKLENMEDI. Ciktiyi Claude'a gonder.
    goto son
  )
)

echo.
echo ===== git commit + push =====
set GIT_ASK_YESNO=false
git add -- src/lib/notifHold.js src/lib/sixImage.js src/components/City/cityHeist.js src/components/HeistPanel/HeistPanel.jsx src/components/TopNotificationBanner/TopNotificationBanner.jsx src/components/Gangs/GangPanel.jsx src/components/Sixtagram/SixPhoto.jsx src/components/Sixtagram/SixStories.jsx src/components/Sixtagram/SixtagramScreen.css yukle-v160-7.bat
git commit -q -m "v160.7: soygun videosunda Gec/ses dugmeleri telefonda calisiyor, sonuc SMS'i video bitince geliyor; Ceteler > Savas detayinda ustteki bosluga dokununca geri (iPhone); Sixtagram'da telefonda eski fotograflar dokununca tek tek ciziliyor (cokmeden), yeni fotograf gorseli bir kez daha deneniyor; eski guncelleme artiklari silindi" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01YQymXP43vKVgye6R66MvP1"
if errorlevel 1 (
  echo.
  echo git commit basarisiz ^(belki degisiklik yok ya da zaten commit edildi^). Ciktiyi Claude'a gonder.
  goto son
)
git push
if errorlevel 1 (
  echo.
  echo git push basarisiz. Site gonderilmedi. Ciktiyi Claude'a gonder.
  goto son
)

echo.
echo ===== Cloudflare derlemesi bekleniyor (en fazla ~8 dk) =====
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $sha=(git rev-parse HEAD).Trim(); $url='https://api.github.com/repos/cetelerinsavasi-afk/neon-sehir/commits/'+$sha+'/check-runs'; $sonuc=$null; for($i=0;$i -lt 32;$i++){ Start-Sleep -Seconds 15; try{ $r=Invoke-RestMethod -Uri $url -Headers @{'User-Agent'='neon-sehir-deploy';'Accept'='application/vnd.github+json'} }catch{ continue }; $cf=$r.check_runs | Where-Object { $_.name -like 'Workers Builds*' } | Select-Object -First 1; if(-not $cf){ Write-Host '  ...Cloudflare henuz baslamadi'; continue }; if($cf.status -ne 'completed'){ Write-Host '  ...Cloudflare derliyor'; continue }; $sonuc=$cf.conclusion; break }; Write-Host ''; if($sonuc -eq 'success'){ Write-Host 'TAMAM: v160.7 yayinda. Oyunu yenile (bilgisayarda Ctrl+F5, telefonda uygulamayi kapatip ac).' -ForegroundColor Green } elseif($sonuc){ Write-Host ('Cloudflare derlemesi BASARISIZ ('+$sonuc+'). Cloudflare panelinde Workers > neon-sehir > Deployments hata kaydini Claude''a gonder.') -ForegroundColor Red } else { Write-Host 'Cloudflare 8 dk icinde derlemeyi bitirmedi. Cloudflare panelinde Workers > neon-sehir > Deployments''ta son commit icin Retry build de.' -ForegroundColor Yellow }"
goto son

:yanlis
echo Bu dosya neon-sehir proje klasorunun ICINDE olmali. HICBIR SEY YAPILMADI.

:son
echo.
pause
