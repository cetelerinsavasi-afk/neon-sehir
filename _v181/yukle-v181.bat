@echo off
REM ============================================================================
REM Neon Sehir v181 - TEK TIK (bu _v181 klasoru neon-sehir klasorunun ICINDE olmali)
REM ONCE v180 yuklenmis olmali.
REM  - Neon Borsa > Hisselerim: elindeki hisselerin su anki toplam degeri ve onayli
REM    "Hepsini sat" (mekan mekan dokum; gosterilen tutar degistiyse satis olmaz,
REM    biriken gelir silinmez).
REM Firebase: borsaAction
REM Geri donus: _v181\geri-al-v181.bat
REM ============================================================================
setlocal
set "HERE=%~dp0"
cd /d "%HERE%.."
if not exist "package.json" goto yanlis
if not exist ".git" goto yanlis
if not exist "%HERE%dosyalar\src\components\Phone\borsa\BorsaApp.jsx" (
  echo _v181\dosyalar eksik. HICBIR SEY YAPILMADI.
  goto son
)

echo.
echo ===== 1/6 yedek + yeni dosyalar =====
for %%F in (functions\borsa.js functions\index.js functions\scripts\borsa.test.mjs preview\borsa-app.jsx src\components\Phone\borsa\BorsaApp.css src\components\Phone\borsa\BorsaApp.jsx) do (
  if exist "%%F" if not exist "%HERE%yedek\%%F" xcopy "%%F" "%HERE%yedek\%%F*" /Y /Q >nul
)
xcopy "%HERE%dosyalar\*" "%CD%" /E /Y /I /Q >nul
if errorlevel 1 (
  echo Dosyalar kopyalanamadi. HICBIR SEY GONDERILMEDI. Ciktiyi Claude'a gonder.
  goto son
)
echo   Dosyalar yerinde. Eski hali: _v181\yedek

echo.
echo ===== 2/6 arayuz derleme kontrolu =====
call npm run build
if errorlevel 1 (
  echo.
  echo Arayuz derlenemedi. HICBIR SEY GONDERILMEDI. Geri almak icin geri-al-v181.bat. Ciktiyi Claude'a gonder.
  goto son
)

echo.
echo ===== 3/6 testler =====
set "TESTLER="
for %%Q in ("functions\scripts\fleet.test.mjs" "functions\scripts\shop.test.mjs" "functions\scripts\business.test.mjs" "functions\scripts\borsa.test.mjs" "functions\scripts\v145.test.mjs" "tests\webview\webview.test.mjs" "tests\city\jobs-resume.test.mjs" "tests\city\kurye.test.mjs" "tests\city\nav-route.test.mjs" "tests\clock\clock-sync.test.mjs" "tests\clock\server-clock.test.mjs" "tests\cost\daily-gate.test.mjs") do (
  if exist "%%~Q" call set "TESTLER=%%TESTLER%% %%~Q"
)
node --test %TESTLER%
if errorlevel 1 (
  echo.
  echo Testler basarisiz. HICBIR SEY GONDERILMEDI. Ciktiyi Claude'a gonder.
  goto son
)

echo.
echo ===== 4/6 Firebase fonksiyonlari =====
set "FN=functions:borsaAction"
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
echo ===== 5/6 git commit + push (sadece v181 dosyalari) =====
set GIT_ASK_YESNO=false
git add -- functions/borsa.js functions/index.js functions/scripts/borsa.test.mjs preview/borsa-app.jsx src/components/Phone/borsa/BorsaApp.css src/components/Phone/borsa/BorsaApp.jsx _v181/yukle-v181.bat _v181/geri-al-v181.bat
git commit -q -m "v181: Neon Borsa Hisselerim - toplam deger ve onayli hepsini sat" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_0182eo1GNYTHCsRAPyPWVtdZ"
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
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $sha=(git rev-parse HEAD).Trim(); $url='https://api.github.com/repos/cetelerinsavasi-afk/neon-sehir/commits/'+$sha+'/check-runs'; $sonuc=$null; for($i=0;$i -lt 32;$i++){ Start-Sleep -Seconds 15; try{ $r=Invoke-RestMethod -Uri $url -Headers @{'User-Agent'='neon-sehir-deploy';'Accept'='application/vnd.github+json'} }catch{ continue }; $cf=$r.check_runs | Where-Object { $_.name -like 'Workers Builds*' } | Select-Object -First 1; if(-not $cf){ Write-Host '  ...Cloudflare henuz baslamadi'; continue }; if($cf.status -ne 'completed'){ Write-Host '  ...Cloudflare derliyor'; continue }; $sonuc=$cf.conclusion; break }; Write-Host ''; if($sonuc -eq 'success'){ Write-Host 'TAMAM: v181 yayinda. Oyunu yenile (telefonda uygulamayi kapatip ac). Oyunu yenile.' -ForegroundColor Green } elseif($sonuc){ Write-Host ('Cloudflare derlemesi BASARISIZ ('+$sonuc+'). Cloudflare panelinde Workers > neon-sehir > Deployments hata kaydini Claude''a gonder.') -ForegroundColor Red } else { Write-Host 'Cloudflare 8 dk icinde derlemeyi bitirmedi. Cloudflare panelinde Workers > neon-sehir > Deployments''ta son commit icin Retry build de.' -ForegroundColor Yellow }"
goto son

:yanlis
echo Bu _v181 klasoru neon-sehir klasorunun ICINDE olmali. HICBIR SEY YAPILMADI.

:son
echo.
pause
