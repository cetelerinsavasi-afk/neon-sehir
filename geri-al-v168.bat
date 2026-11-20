@echo off
REM ============================================================================
REM Neon Sehir v168 GERI AL - TEK TIK (v168 commit'ini git revert ile geri alir)
REM Site + gorev sirasi fonksiyonlari geri alinir. Veri silinmez; ama bu surumde ilerleyen
REM yeni oyuncularin gorev sirasi eski listeye gore kayabilir (en fazla birkac gorev).
REM ============================================================================
setlocal
cd /d "%~dp0"
if not exist "package.json" goto yanlis
if not exist ".git" goto yanlis

set "V168="
for /f "tokens=1" %%H in ('git log -n 1 --pretty^=oneline --grep^="^v168: Riza Amca senaryosu"') do set "V168=%%H"
if not defined V168 (
  echo v168 commit'i bulunamadi. HICBIR SEY YAPILMADI. Ciktiyi Claude'a gonder.
  goto son
)
echo Geri alinacak commit: %V168%

echo.
echo ===== git revert + push =====
set GIT_ASK_YESNO=false
git revert --no-edit %V168%
if errorlevel 1 (
  echo.
  echo git revert basarisiz ^(cakisma olabilir^). "git revert --abort" yazip ciktiyi Claude'a gonder.
  goto son
)
git push
if errorlevel 1 (
  echo.
  echo git push basarisiz. Ciktiyi Claude'a gonder.
  goto son
)

echo.
echo ===== Firebase fonksiyonlari eski gorev sirasina =====
call firebase deploy --only functions:checkOnboardingProgress,functions:completeOnboardingChecklist,functions:produceAtFactory,functions:takeVehicleLoan,functions:takeCredit,functions:prayAtMosque,functions:bribePolice,functions:buyFromVendor,functions:attemptHeist,functions:sellContrabandAtPark,functions:sendChatMessage,functions:setAvatar,functions:buyListing,functions:shopAction,functions:gangAction
if errorlevel 1 (
  echo.
  echo Fonksiyonlar yuklenemedi. Site geri alindi ama gorev sirasi icin bu adimi tekrar calistir: firebase deploy --only functions:checkOnboardingProgress,functions:completeOnboardingChecklist,functions:produceAtFactory,functions:takeVehicleLoan,functions:takeCredit,functions:prayAtMosque,functions:bribePolice,functions:buyFromVendor,functions:attemptHeist,functions:sellContrabandAtPark,functions:sendChatMessage,functions:setAvatar,functions:buyListing,functions:shopAction,functions:gangAction
)

echo.
echo ===== Cloudflare derlemesi bekleniyor (en fazla ~8 dk) =====
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $sha=(git rev-parse HEAD).Trim(); $url='https://api.github.com/repos/cetelerinsavasi-afk/neon-sehir/commits/'+$sha+'/check-runs'; $sonuc=$null; for($i=0;$i -lt 32;$i++){ Start-Sleep -Seconds 15; try{ $r=Invoke-RestMethod -Uri $url -Headers @{'User-Agent'='neon-sehir-deploy';'Accept'='application/vnd.github+json'} }catch{ continue }; $cf=$r.check_runs | Where-Object { $_.name -like 'Workers Builds*' } | Select-Object -First 1; if(-not $cf){ Write-Host '  ...Cloudflare henuz baslamadi'; continue }; if($cf.status -ne 'completed'){ Write-Host '  ...Cloudflare derliyor'; continue }; $sonuc=$cf.conclusion; break }; Write-Host ''; if($sonuc -eq 'success'){ Write-Host 'TAMAM: yayinda. Oyunu yenile.' -ForegroundColor Green } elseif($sonuc){ Write-Host ('Cloudflare derlemesi BASARISIZ ('+$sonuc+'). Cloudflare panelinde Workers > neon-sehir > Deployments hata kaydini Claude''a gonder.') -ForegroundColor Red } else { Write-Host 'Cloudflare 8 dk icinde derlemeyi bitirmedi. Cloudflare panelinde Workers > neon-sehir > Deployments''ta son commit icin Retry build de.' -ForegroundColor Yellow }"
goto son

:yanlis
echo Bu dosya neon-sehir proje klasorunun ICINDE olmali. HICBIR SEY YAPILMADI.

:son
echo.
pause
