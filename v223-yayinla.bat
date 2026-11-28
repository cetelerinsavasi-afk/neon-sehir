@echo off
REM Neon Sehir v223 - kaykay: fotografta kaykay + dogru yon, geri gitme, daha az dusme, havada dusunce yon bozulmasi,
REM sol ustte "In" dugmesi, kaykay + helikopterde joystick; profilde kaykay, motor/ticaride seviye/hiz yazmaz.
REM 0) dosyalari proje klasorune kopyala  1) testler  2) derleme  3) fonksiyonlar  4) commit  5) push  6) Cloudflare
REM RTDB ve Firestore kurallari DEGISMEDI. Herhangi bir adim hata verirse durur.
setlocal
set "KAYNAK=%~dp0dosyalar"
set "PROJE=%USERPROFILE%\Downloads\neon-sehir"

if not exist "%PROJE%\package.json" (
  echo Proje klasoru bulunamadi: %PROJE%
  set /p "PROJE=neon-sehir klasorunun tam yolunu yaz: "
)
if not exist "%PROJE%\package.json" (
  echo HATA: "%PROJE%" icinde package.json yok.
  goto hata
)
if not exist "%KAYNAK%\src" (
  echo HATA: guncelleme dosyalari bulunamadi: %KAYNAK%
  goto hata
)

echo.
echo === 0/6  Dosyalar proje klasorune kopyalaniyor
echo   %KAYNAK%  -^>  %PROJE%
xcopy "%KAYNAK%\*" "%PROJE%\" /E /Y /I /Q
if errorlevel 1 goto hata

cd /d "%PROJE%"

echo.
echo === 1/6  Testler (node --test)
call node --test tests/city/kurye.test.mjs tests/city/nav-route.test.mjs tests/ui/borsa-ui.test.mjs tests/ui/force-update.test.mjs tests/ui/city-hud.test.mjs
if errorlevel 1 goto hata

echo.
echo === 2/6  Derleniyor (npm run build)
call npm run build
if errorlevel 1 goto hata

echo.
echo === 3/6  Fonksiyonlar yayinlaniyor (fotografta kaykay: sk / sb)
call npx firebase deploy --only functions
if errorlevel 1 goto hata

echo.
echo === 4/6  Commit
git status --short
git add -A
REM Gizli dosyalar asla commit edilmez
git reset -q -- .env .env.local android-webview/keystore.properties android-webview/local.properties >nul 2>&1
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "v223: kaykay fotografta gorunur + dogru yon, geri gitme, daha az dusme, havada dusunce yon duzeltmesi, sol ustte In dugmesi, kaykay/helikopter joystick, profilde kaykay, motor/ticaride seviye-hiz yazmaz" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01YQymXNRD7aAdL4JCDFxUva"
  if errorlevel 1 goto hata
) else (
  echo Commitlenecek yeni degisiklik yok, devam ediliyor.
)

echo.
echo === 5/6  GitHub'a gonderiliyor (push)
for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD') do set "BR=%%b"
git push origin %BR%
if errorlevel 1 goto hata

echo.
echo === 6/6  Cloudflare'a yayinlaniyor (wrangler deploy)
call npx wrangler deploy
if errorlevel 1 goto hata

echo.
echo TAMAM: v223 GitHub'da (%BR%) ve site yayinda.
pause
exit /b 0

:hata
echo.
echo HATA: yukaridaki adim basarisiz oldu, islem durduruldu.
pause
exit /b 1
