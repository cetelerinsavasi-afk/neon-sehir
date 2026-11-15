@echo off
REM ============================================================================
REM Neon Sehir v161.1 - TEK TIK (v161 dahil: v161 bat calismadiysa sadece bunu calistir): derler, test eder, Firebase fonksiyonlarini yukler,
REM commit + push eder (Cloudflare siteyi kendisi derler) ve derlemenin sonucunu bekler.
REM   - Telefon: Cappstore (Parara, Fabrika, Isletme, Futbol, Belediye indirilebilir)
REM     Dock: SMS / ChatsApp / 2. El / Sixtagram (sabit). Basili tut: tasi / sil
REM   - Mekanlar > Ziyaret: "Mekanlarim" kategorisi
REM   - Profil: suphe / sayginlik / zumrut / altina dokununca adi gorunur
REM   - Sixtagram: cift dokunma ile begeni yeniden calisiyor
REM   - Modifiye studyosu: telefonda oyundan atma duzeltildi (ortak cizici)
REM   - Otobus ve tir %%50 hizli (sunucudaki is sureleri de guncellendi)
REM   - 2. El: aninda satilan arac da modifiyeli gorunur / modifiyesiyle satilir
REM   - Altin butonu ve telefondaki altin: Zumrut Magazasi acilir
REM   v161.1:
REM   - Kervankent girisindeki Neon Petrol: gorunmez engel (gomulu cim ada) kalkti
REM   - Araclar cimde / arazide gezer; agac, bariyer, duvar, su, cok dik yamac engel
REM Bu surumde Firebase FONKSIYONU DEGISTI (shopAction, instantSellListing).
REM Veritabani kurali DEGISMEDI.
REM Calistirma: bu dosyaya cift tikla (neon-sehir klasorunun icinde olmali).
REM ============================================================================
setlocal
cd /d "%~dp0"
if not exist "package.json" goto yanlis
if not exist "src\components\City\cityEngine.js" goto yanlis
if not exist ".git" goto yanlis
if not exist "src\components\Phone\cappstoreApps.js" (
  echo v161 dosyalari bulunamadi ^(src\components\Phone\cappstoreApps.js yok^). HICBIR SEY YAPILMADI.
  goto son
)

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
echo ===== Firebase fonksiyonlari (shopAction: meslek sureleri, instantSellListing: 2. El modifiye) =====
call firebase deploy --only functions:shopAction,functions:instantSellListing
if errorlevel 1 (
  echo.
  echo Firebase fonksiyon yuklemesi basarisiz. Site GONDERILMEDI. Ciktiyi Claude'a gonder.
  echo ^(Giris istiyorsa once: firebase login^)
  goto son
)

echo.
echo ===== git commit + push =====
set GIT_ASK_YESNO=false
git add -- src/App.jsx src/components/Hud/Hud.jsx src/components/Phone/PhoneScreen.jsx src/components/Phone/PhoneScreen.css src/components/Phone/Cappstore.css src/components/Phone/CappstoreScreen.jsx src/components/Phone/BusinessesApp.jsx src/components/Phone/cappstoreApps.js src/components/Phone/phoneIcons.jsx src/components/HouseScreen/HouseScreen.jsx src/components/Workshop/ModifiyeStudio.jsx src/components/Workshop/ModifiyeStudio.css src/components/HomeScreen/HomeScreen.jsx src/components/HomeScreen/HomeScreen.css src/components/MekanlarScreen/VisitTab.jsx src/components/Sixtagram/PostCard.jsx src/components/Sixtagram/PostCard.css src/components/City/vehicles.js functions/jobs.js functions/index.js src/components/City/world/roadside.js src/components/City/world/outerWorld.js src/components/City/cityEngine.js src/components/City/kit.js yukle-v161.bat yukle-v161-1.bat
git commit -q -m "v161.1: arazide surus (cim acik; agac/bariyer/duvar/su engel), Kervankent benzinliginde gorunmez engel kalkti; v161: telefona Cappstore (Parara/Fabrika/Isletme/Futbol/Belediye indirilebilir, basili tutup tasi/sil, belediye gorevden cikinca silinir), dock'ta Sixtagram; Ziyaret'e Mekanlarim; profil degerlerine dokununca etiket; Sixtagram cift dokunma begeni; modifiye studyosu ortak cizici (telefonda cokme); otobus/tir %%50 hizli; aninda satilan arac 2. El'de modifiyeli; altin -> Zumrut Magazasi" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01YQymXK5Usn4VxqoTdGV9Ac"
if errorlevel 1 (
  echo.
  echo git commit basarisiz ^(belki degisiklik yok ya da zaten commit edildi^). Ciktiyi Claude'a gonder.
  goto son
)
git push
if errorlevel 1 (
  echo.
  echo git push basarisiz. Site gonderilmedi ^(fonksiyonlar yuklendi^). Ciktiyi Claude'a gonder.
  goto son
)

echo.
echo ===== Cloudflare derlemesi bekleniyor (en fazla ~8 dk) =====
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $sha=(git rev-parse HEAD).Trim(); $url='https://api.github.com/repos/cetelerinsavasi-afk/neon-sehir/commits/'+$sha+'/check-runs'; $sonuc=$null; for($i=0;$i -lt 32;$i++){ Start-Sleep -Seconds 15; try{ $r=Invoke-RestMethod -Uri $url -Headers @{'User-Agent'='neon-sehir-deploy';'Accept'='application/vnd.github+json'} }catch{ continue }; $cf=$r.check_runs | Where-Object { $_.name -like 'Workers Builds*' } | Select-Object -First 1; if(-not $cf){ Write-Host '  ...Cloudflare henuz baslamadi'; continue }; if($cf.status -ne 'completed'){ Write-Host '  ...Cloudflare derliyor'; continue }; $sonuc=$cf.conclusion; break }; Write-Host ''; if($sonuc -eq 'success'){ Write-Host 'TAMAM: v161.1 yayinda. Oyunu yenile (bilgisayarda Ctrl+F5, telefonda uygulamayi kapatip ac).' -ForegroundColor Green } elseif($sonuc){ Write-Host ('Cloudflare derlemesi BASARISIZ ('+$sonuc+'). Cloudflare panelinde Workers > neon-sehir > Deployments hata kaydini Claude''a gonder.') -ForegroundColor Red } else { Write-Host 'Cloudflare 8 dk icinde derlemeyi bitirmedi. Cloudflare panelinde Workers > neon-sehir > Deployments''ta son commit icin Retry build de.' -ForegroundColor Yellow }"
goto son

:yanlis
echo Bu dosya neon-sehir proje klasorunun ICINDE olmali. HICBIR SEY YAPILMADI.

:son
echo.
pause
