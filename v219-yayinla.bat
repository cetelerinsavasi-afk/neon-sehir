@echo off
REM Neon Sehir v219 - Yeni sehir plani (harita duzeni 5), dukkanlar sokagi (6 dukkan, petshop), sehir disindaki pist, helikopter, hali saha, kaykay, La Marea (masaya servis).
REM Bu dosyayi proje klasorune (yayinla.bat'in yanina) koy ve cift tikla.
REM 0) gereksiz eski dosyalari siler  1) neon-sehir-v219.zip'i proje klasorune acar (once bu klasorde, yoksa Indirilenler'de arar)
REM 2) testler  3) derleme  4) TUM fonksiyonlar + RTDB kurallari yayini  5) commit  6) push  7) Cloudflare
REM Firestore kurallari ve indeksleri DEGISMEZ. Herhangi bir adim hata verirse durur; sonraki adimlar calismaz.
setlocal
cd /d "%~dp0"

echo.
echo === 0/7  Gereksiz eski dosyalar siliniyor
for %%f in (v216-yayinla.bat v217-yayinla.bat v218-yayinla.bat geri-al-3d-avatar.bat firebase-debug.log firestore-debug.log database-debug.log ui-debug.log) do (
  if exist "%%f" (
    del /q "%%f"
    echo silindi: %%f
  )
)
if exist "_yedek_3d_avatar" (
  rmdir /s /q "_yedek_3d_avatar"
  echo silindi: _yedek_3d_avatar\
)
for %%z in (neon-sehir-v2*.zip) do (
  if /i not "%%~nxz"=="neon-sehir-v219.zip" (
    del /q "%%z"
    echo silindi: %%z
  )
)

echo.
echo === 1/7  Guncelleme dosyalari aciliyor (neon-sehir-v219.zip)
set "ZIP="
if exist "%~dp0neon-sehir-v219.zip" set "ZIP=%~dp0neon-sehir-v219.zip"
if not defined ZIP if exist "%USERPROFILE%\Downloads\neon-sehir-v219.zip" set "ZIP=%USERPROFILE%\Downloads\neon-sehir-v219.zip"
if not defined ZIP (
  echo neon-sehir-v219.zip bulunamadi. Zip'i bu klasore ya da Indirilenler'e koyup tekrar dene.
  goto hata
)
echo Zip: %ZIP%
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '%ZIP%' -DestinationPath '%~dp0.' -Force"
if errorlevel 1 goto hata
if not exist "docs\v219-guncelleme.md" (
  echo Dosyalar dogru yere acilmadi.
  goto hata
)

echo.
echo === 2/7  Testler (node --test)
pushd functions
call node --test scripts/v219.test.mjs scripts/fleet.test.mjs scripts/v157-far-jobs.test.mjs scripts/v158-far-back.test.mjs scripts/v196-economy.test.mjs scripts/onboarding.test.mjs gang/test/treasury.test.js gang/test/exploits.test.js
if errorlevel 1 (
  popd
  goto hata
)
popd
call node --test tests/city/kurye.test.mjs tests/city/nav-route.test.mjs tests/ui/borsa-ui.test.mjs tests/ui/force-update.test.mjs
if errorlevel 1 goto hata

echo.
echo === 3/7  Derleniyor (npm run build)
call npm run build
if errorlevel 1 goto hata

echo.
echo === 4/7  Sunucu: tum fonksiyonlar + RTDB kurallari yayinlaniyor (birkac dakika surebilir)
call npx firebase deploy --only functions,database
if errorlevel 1 goto hata

echo.
echo === 5/7  Commit
git status --short
git add -A
REM Gizli dosyalar asla commit edilmez (eklenmis olsalar bile geri cikarilir)
git reset -q -- .env .env.local android-webview/keystore.properties android-webview/local.properties >nul 2>&1
git reset -q -- neon-sehir-v219.zip >nul 2>&1
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "v219: yeni sehir plani, dukkanlar sokagi (petshop, aksesuarci), sehir disinda pist + helikopter, hali saha / basket / kaykay, La Marea masaya servis, seyyar hisseleri birlesti, cafe-bar-restoran parasi yok olur" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_0182eo1HtRpxV1jFhSACJ78U"
  if errorlevel 1 goto hata
) else (
  echo Commitlenecek yeni degisiklik yok, devam ediliyor.
)

echo.
echo === 6/7  GitHub'a gonderiliyor (push)
for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD') do set "BR=%%b"
git push origin %BR%
if errorlevel 1 goto hata

echo.
echo === 7/7  Cloudflare'a yayinlaniyor (wrangler deploy)
call npx wrangler deploy
if errorlevel 1 goto hata

echo.
echo TAMAM: v219 GitHub'da (%BR%), fonksiyonlar + RTDB kurallari ve site yayinda.
echo Seyyar hisse birlestirmesi ilk saat basinda (ya da biri seyyar hissesine dokununca) kendiliginden calisir.
pause
exit /b 0

:hata
echo.
echo HATA: yukaridaki adim basarisiz oldu, islem durduruldu.
pause
exit /b 1
