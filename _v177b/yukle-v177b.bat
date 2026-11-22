@echo off
REM ============================================================================
REM Neon Sehir v177b - EKSIK KALAN v176 DOSYALARI (bu _v177b klasoru neon-sehir klasorunun ICINDE olmali)
REM v176 (Neon Borsa + Parara Bank yeni tasarim) GitHub'a hic gonderilmemis; v177 sadece
REM kendi dosyalarini gonderdigi icin telefonda Borsa ve yeni banka ekrani cikmadi.
REM Bu paket sadece o eksik dosyalari ekler (v177'deki hicbir dosyaya dokunmaz):
REM  - telefon: Cappstore'da Neon Borsa, ikon, uygulama ekrani; Parara Bank yeni tasarim
REM  - Ticaret Bakanligi raporunda hisse vergisi
REM  - firestore kurallari: borsa/piyasa okuma izni
REM  - hesap silinince hisseler havuza doner
REM  - Firebase: buyFromVendor (seyyar satici gelirleri hissedarlara), adminAccountDeletion
REM Geri donus: _v177b\geri-al-v177b.bat
REM ============================================================================
setlocal
set "HERE=%~dp0"
cd /d "%HERE%.."
if not exist "package.json" goto yanlis
if not exist ".git" goto yanlis
if not exist "%HERE%dosyalar\src\components\Phone\borsa\BorsaApp.css" (
  echo _v177bb\dosyalar eksik. HICBIR SEY YAPILMADI.
  goto son
)

echo.
echo ===== 1/6 yedek + yeni dosyalar =====
for %%F in (firestore.rules functions\accountDeletion.js preview\borsa.html src\components\BankScreen\BankScreen.css src\components\BankScreen\BankScreen.jsx src\components\Belediye\BakanliklarTab.jsx src\components\Phone\PhoneScreen.css src\components\Phone\PhoneScreen.jsx src\components\Phone\borsa\BorsaApp.css src\components\Phone\cappstoreApps.js src\components\Phone\phoneIcons.jsx src\services\gameActions.js) do (
  if exist "%%F" if not exist "%HERE%yedek\%%F" xcopy "%%F" "%HERE%yedek\%%F*" /Y /Q >nul
)
xcopy "%HERE%dosyalar\*" "%CD%" /E /Y /I /Q >nul
if errorlevel 1 (
  echo Dosyalar kopyalanamadi. HICBIR SEY GONDERILMEDI. Ciktiyi Claude'a gonder.
  goto son
)
echo   Dosyalar yerinde. Eski hali: _v177bb\yedek

echo.
echo ===== 2/6 arayuz derleme kontrolu =====
call npm run build
if errorlevel 1 (
  echo.
  echo Arayuz derlenemedi. HICBIR SEY GONDERILMEDI. Geri almak icin geri-al-v177b.bat. Ciktiyi Claude'a gonder.
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
echo ===== 4/6 Firebase fonksiyonlari + firestore kurallari =====
set "FN=functions:buyFromVendor,functions:adminAccountDeletion,firestore:rules"
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
echo ===== 5/6 git commit + push (sadece v177b dosyalari) =====
set GIT_ASK_YESNO=false
git add -- firestore.rules functions/accountDeletion.js preview/borsa.html src/components/BankScreen/BankScreen.css src/components/BankScreen/BankScreen.jsx src/components/Belediye/BakanliklarTab.jsx src/components/Phone/PhoneScreen.css src/components/Phone/PhoneScreen.jsx src/components/Phone/borsa/BorsaApp.css src/components/Phone/cappstoreApps.js src/components/Phone/phoneIcons.jsx src/services/gameActions.js _v177b/yukle-v177b.bat _v177b/geri-al-v177b.bat
git commit -q -m "v177b: v176 eksik dosyalari - Neon Borsa telefon uygulamasi, Parara Bank yeni tasarim, borsa firestore kurali, hesap silmede hisseler" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_0182eo1GNYTHCsRAPyPWVtdZ"
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
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $sha=(git rev-parse HEAD).Trim(); $url='https://api.github.com/repos/cetelerinsavasi-afk/neon-sehir/commits/'+$sha+'/check-runs'; $sonuc=$null; for($i=0;$i -lt 32;$i++){ Start-Sleep -Seconds 15; try{ $r=Invoke-RestMethod -Uri $url -Headers @{'User-Agent'='neon-sehir-deploy';'Accept'='application/vnd.github+json'} }catch{ continue }; $cf=$r.check_runs | Where-Object { $_.name -like 'Workers Builds*' } | Select-Object -First 1; if(-not $cf){ Write-Host '  ...Cloudflare henuz baslamadi'; continue }; if($cf.status -ne 'completed'){ Write-Host '  ...Cloudflare derliyor'; continue }; $sonuc=$cf.conclusion; break }; Write-Host ''; if($sonuc -eq 'success'){ Write-Host 'TAMAM: v177b yayinda. Oyunu yenile (telefonda uygulamayi kapatip ac). Telefonda Cappstore > Neon Borsa > Yukle.' -ForegroundColor Green } elseif($sonuc){ Write-Host ('Cloudflare derlemesi BASARISIZ ('+$sonuc+'). Cloudflare panelinde Workers > neon-sehir > Deployments hata kaydini Claude''a gonder.') -ForegroundColor Red } else { Write-Host 'Cloudflare 8 dk icinde derlemeyi bitirmedi. Cloudflare panelinde Workers > neon-sehir > Deployments''ta son commit icin Retry build de.' -ForegroundColor Yellow }"
goto son

:yanlis
echo Bu _v177bb klasoru neon-sehir klasorunun ICINDE olmali. HICBIR SEY YAPILMADI.

:son
echo.
pause
