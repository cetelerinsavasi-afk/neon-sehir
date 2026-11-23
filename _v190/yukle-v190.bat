@echo off
REM ============================================================================
REM Neon Sehir v190 - TEK TIK (bu _v190 klasoru neon-sehir klasorunun ICINDE olmali)
REM ONCE v189 yuklenmis olmali. Sadece Neon Borsa ekrani (Firebase'e yukleme YOK):
REM  - detaydaki "Bugun aldigin hisse..." notu kalkti
REM  - Hisselerim'de her hissenin yanindaki "Hepsini sat" butonu kalkti
REM  - ustteki buton "Hepsini sat (tum mekanlar)" yerine "Hepsini sat"
REM  - altin yetmeyince al butonu yine pasif ama fiyati yaziyor
REM  - listedeki kucuk grafik 24 saat yerine 7 gunluk
REM Geri donus: _v190\geri-al-v190.bat
REM ============================================================================
setlocal
set "HERE=%~dp0"
cd /d "%HERE%.."
if not exist "package.json" goto yanlis
if not exist ".git" goto yanlis
if not exist "src\lib\forceUpdate.js" (
  echo Once v189 yuklenmeli. HICBIR SEY YAPILMADI.
  goto son
)
if not exist "%HERE%dosyalar\src\components\Phone\borsa\BorsaApp.jsx" (
  echo _v190\dosyalar eksik. HICBIR SEY YAPILMADI.
  goto son
)

set "DEGISEN=src\components\Phone\borsa\BorsaApp.jsx tests\ui\borsa-ui.test.mjs"
set "YENI="

echo.
echo ===== 1/6 yedek + yeni dosyalar =====
if not exist "%HERE%yedek" mkdir "%HERE%yedek"
for %%F in (%DEGISEN%) do (
  if exist "%%F" if not exist "%HERE%yedek\%%F" xcopy "%%F" "%HERE%yedek\%%F*" /Y /Q >nul
)
if not exist "%HERE%yedek\_yeni.txt" (
  type nul > "%HERE%yedek\_yeni.txt"
  for %%F in (%YENI%) do (
    if not exist "%%F" echo %%F>> "%HERE%yedek\_yeni.txt"
  )
)
xcopy "%HERE%dosyalar\*" "%CD%" /E /Y /I /Q >nul
if errorlevel 1 (
  echo Dosyalar kopyalanamadi. HICBIR SEY GONDERILMEDI. Ciktiyi Claude'a gonder.
  goto son
)
echo   Dosyalar yerinde. Eski hali: _v190\yedek

echo.
echo ===== 2/6 arayuz derleme kontrolu =====
call npm run build
if errorlevel 1 (
  echo.
  echo Arayuz derlenemedi. HICBIR SEY GONDERILMEDI. Geri almak icin geri-al-v190.bat. Ciktiyi Claude'a gonder.
  goto son
)

echo.
echo ===== 3/6 testler =====
set "TESTLER="
for %%Q in ("tests\ui\borsa-ui.test.mjs" "tests\ui\tap-guard.test.mjs" "tests\ui\force-update.test.mjs" "functions\scripts\borsa.test.mjs") do (
  if exist "%%~Q" call set "TESTLER=%%TESTLER%% %%~Q"
)
node --test %TESTLER%
if errorlevel 1 (
  echo.
  echo Testler basarisiz. HICBIR SEY GONDERILMEDI. Geri almak icin geri-al-v190.bat. Ciktiyi Claude'a gonder.
  goto son
)

echo.
echo ===== 4/6 Firebase: bu surumde yukleme yok (sadece ekran) =====

echo.
echo ===== 5/6 git commit + push (sadece v190 dosyalari) =====
set GIT_ASK_YESNO=false
git add -- src/components/Phone/borsa/BorsaApp.jsx tests/ui/borsa-ui.test.mjs _v190/yukle-v190.bat _v190/geri-al-v190.bat
git commit -q -m "v190: Neon Borsa ekrani - bugun alinan hisse notu ve Hisselerimdeki tek tek Hepsini sat butonlari kalkti, Hepsini sat yazisi, altin yetmeyince fiyat gorunur, listede 7 gunluk mini grafik" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_0182eo1KDAiqXDNdScxr225v"
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
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $sha=(git rev-parse HEAD).Trim(); $url='https://api.github.com/repos/cetelerinsavasi-afk/neon-sehir/commits/'+$sha+'/check-runs'; $sonuc=$null; for($i=0;$i -lt 32;$i++){ Start-Sleep -Seconds 15; try{ $r=Invoke-RestMethod -Uri $url -Headers @{'User-Agent'='neon-sehir-deploy';'Accept'='application/vnd.github+json'} }catch{ continue }; $cf=$r.check_runs | Where-Object { $_.name -like 'Workers Builds*' } | Select-Object -First 1; if(-not $cf){ Write-Host '  ...Cloudflare henuz baslamadi'; continue }; if($cf.status -ne 'completed'){ Write-Host '  ...Cloudflare derliyor'; continue }; $sonuc=$cf.conclusion; break }; Write-Host ''; if($sonuc -eq 'success'){ Write-Host 'TAMAM: v190 yayinda. Oyunu yenile (telefonda uygulamayi kapatip ac).' -ForegroundColor Green } elseif($sonuc){ Write-Host ('Cloudflare derlemesi BASARISIZ ('+$sonuc+'). Cloudflare panelinde Workers > neon-sehir > Deployments hata kaydini Claude''a gonder.') -ForegroundColor Red } else { Write-Host 'Cloudflare 8 dk icinde derlemeyi bitirmedi. Cloudflare panelinde Workers > neon-sehir > Deployments''ta son commit icin Retry build de.' -ForegroundColor Yellow }"
goto son

:yanlis
echo Bu _v190 klasoru neon-sehir klasorunun ICINDE olmali. HICBIR SEY YAPILMADI.

:son
echo.
pause
