@echo off
REM ============================================================================
REM Neon Sehir v175 - TEK TIK (bu _v175 klasoru neon-sehir klasorunun ICINDE olmali)
REM  1) Degisecek 4 dosyanin yedegi: _v175\yedek
REM  2) _v175\dosyalar icindekiler eskilerinin yerine kopyalanir
REM  3) Derleme + testler
REM  4) git commit + push (SADECE v175 dosyalari) ve Cloudflare beklenir
REM Firebase fonksiyonu / veritabani kurali DEGISMEDI (firebase deploy gerekmez).
REM Degisenler:
REM  - Yolcuyken araba titremesi: baskasinin arabasi artik kisa bir tampondan akici cizilir
REM    (mobil ag kayitlari toplu ~1 sn'de bir getirince araba "saniyede bir ilerliyordu")
REM  - Fotografta aractaki / motordaki / sudaki surucu: arka gorunus (ense) fotograftan once
REM    hazirlanir (eskiden yuz kameraya donuk ya da motorda surucu hic gorunmuyordu)
REM  - Camlik Piknik Alani ve Neon Kent Ormani piknik banklarina oturulur
REM  - Bir koltuga bir kisi: baskasinin oturdugu koltuga oturulmaz (ust uste oturma yok)
REM  - Evcil hayvan sehir disinda (koy yollari, tepe, vadi) yerde yurur; havada asili /
REM    yerin altinda kalma ve geride kalma duzeldi
REM Firestore / RTDB okuma-yazma ARTMAZ. Geri donus: _v175\geri-al-v175.bat
REM ============================================================================
setlocal
set "HERE=%~dp0"
cd /d "%HERE%.."
if not exist "package.json" goto yanlis
if not exist ".git" goto yanlis
if not exist "%HERE%dosyalar\src\components\City\cityEngine.js" (
  echo _v175\dosyalar eksik. HICBIR SEY YAPILMADI.
  goto son
)

echo.
echo ===== 1/5 yedek + yeni dosyalar =====
for %%F in (src\components\City\cityEngine.js src\components\City\world\roadside.js src\components\City\world\northPark.js src\components\HouseScreen\houseEngine.js) do (
  if exist "%%F" if not exist "%HERE%yedek\%%F" xcopy "%%F" "%HERE%yedek\%%F*" /Y /Q >nul
)
xcopy "%HERE%dosyalar\*" "%CD%" /E /Y /I /Q >nul
if errorlevel 1 (
  echo Dosyalar kopyalanamadi. HICBIR SEY GONDERILMEDI. Ciktiyi Claude'a gonder.
  goto son
)
echo   Dosyalar yerinde. Eski hali: _v175\yedek

echo.
echo ===== 2/5 arayuz derleme kontrolu =====
call npm run build
if errorlevel 1 (
  echo.
  echo Arayuz derlenemedi. HICBIR SEY GONDERILMEDI. Geri almak icin geri-al-v175.bat. Ciktiyi Claude'a gonder.
  goto son
)

echo.
echo ===== 3/5 testler =====
set "TESTLER="
for %%T in ("tests\webview\webview.test.mjs" "tests\city\jobs-resume.test.mjs" "tests\city\kurye.test.mjs" "tests\city\nav-route.test.mjs" "tests\clock\clock-sync.test.mjs" "tests\clock\server-clock.test.mjs" "tests\cost\daily-gate.test.mjs") do (
  if exist "%%~T" call set "TESTLER=%%TESTLER%% %%~T"
)
if defined TESTLER (
  node --test %TESTLER%
  if errorlevel 1 (
    echo.
    echo Testler basarisiz. HICBIR SEY GONDERILMEDI. Ciktiyi Claude'a gonder.
    goto son
  )
)

echo.
echo ===== 4/5 git commit + push (sadece v175 dosyalari) =====
set GIT_ASK_YESNO=false
git add -- src/components/City/cityEngine.js src/components/City/world/roadside.js src/components/City/world/northPark.js src/components/HouseScreen/houseEngine.js _v175/yukle-v175.bat _v175/geri-al-v175.bat
git commit -q -m "v175: yolcuyken araba titremesi (uzak araba tampondan akici), fotografta surucunun arka gorunusu (motor / suda arac), piknik banklarina oturma, bir koltuga bir kisi, sehir disinda evcil hayvan yuksekligi" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_0182eo1GNYTHCsRAPyPWVtdZ"
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
echo ===== 5/5 Cloudflare derlemesi bekleniyor (en fazla ~8 dk) =====
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $sha=(git rev-parse HEAD).Trim(); $url='https://api.github.com/repos/cetelerinsavasi-afk/neon-sehir/commits/'+$sha+'/check-runs'; $sonuc=$null; for($i=0;$i -lt 32;$i++){ Start-Sleep -Seconds 15; try{ $r=Invoke-RestMethod -Uri $url -Headers @{'User-Agent'='neon-sehir-deploy';'Accept'='application/vnd.github+json'} }catch{ continue }; $cf=$r.check_runs | Where-Object { $_.name -like 'Workers Builds*' } | Select-Object -First 1; if(-not $cf){ Write-Host '  ...Cloudflare henuz baslamadi'; continue }; if($cf.status -ne 'completed'){ Write-Host '  ...Cloudflare derliyor'; continue }; $sonuc=$cf.conclusion; break }; Write-Host ''; if($sonuc -eq 'success'){ Write-Host 'TAMAM: v175 yayinda. Oyunu yenile (telefonda uygulamayi kapatip ac).' -ForegroundColor Green } elseif($sonuc){ Write-Host ('Cloudflare derlemesi BASARISIZ ('+$sonuc+'). Cloudflare panelinde Workers > neon-sehir > Deployments hata kaydini Claude''a gonder.') -ForegroundColor Red } else { Write-Host 'Cloudflare 8 dk icinde derlemeyi bitirmedi. Cloudflare panelinde Workers > neon-sehir > Deployments''ta son commit icin Retry build de.' -ForegroundColor Yellow }"
goto son

:yanlis
echo Bu _v175 klasoru neon-sehir klasorunun ICINDE olmali. HICBIR SEY YAPILMADI.

:son
echo.
pause
