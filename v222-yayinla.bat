@echo off
REM Neon Sehir v222 - yon / yerlesim duzeltmeleri:
REM seyyar saticilar + silahci yonu, komiser masasi + koltukta oturma, galeri masasi,
REM internet kafe (kasiyer, tasan mobilyalar, hoparlor), benzinlik market kasasi,
REM Kervankent camii / benzinlik kamera acisi.
REM 0) dosyalari proje klasorune kopyala  1) testler  2) derleme  3) commit  4) push  5) Cloudflare
REM Sunucu (fonksiyonlar), RTDB ve Firestore kurallari DEGISMEDI. Herhangi bir adim hata verirse durur.
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
echo === 0/5  Dosyalar proje klasorune kopyalaniyor
echo   %KAYNAK%  -^>  %PROJE%
xcopy "%KAYNAK%\*" "%PROJE%\" /E /Y /I /Q
if errorlevel 1 goto hata

cd /d "%PROJE%"

echo.
echo === 1/5  Testler (node --test)
call node --test tests/city/kurye.test.mjs tests/city/nav-route.test.mjs tests/ui/borsa-ui.test.mjs tests/ui/force-update.test.mjs tests/ui/city-hud.test.mjs
if errorlevel 1 goto hata

echo.
echo === 2/5  Derleniyor (npm run build)
call npm run build
if errorlevel 1 goto hata

echo.
echo === 3/5  Commit
git status --short
git add -A
REM Gizli dosyalar asla commit edilmez
git reset -q -- .env .env.local android-webview/keystore.properties android-webview/local.properties >nul 2>&1
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "v222: seyyar satici + silahci yonu, komiser masasi ve koltukta oturma, galeri masasi, internet kafe kasiyer/tasan mobilya/hoparlor, benzinlik kasasi ters, Kervankent camii/benzinlik kamera acisi" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_0182eo1JWDNzfCJR7NVuPBnM"
  if errorlevel 1 goto hata
) else (
  echo Commitlenecek yeni degisiklik yok, devam ediliyor.
)

echo.
echo === 4/5  GitHub'a gonderiliyor (push)
for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD') do set "BR=%%b"
git push origin %BR%
if errorlevel 1 goto hata

echo.
echo === 5/5  Cloudflare'a yayinlaniyor (wrangler deploy)
call npx wrangler deploy
if errorlevel 1 goto hata

echo.
echo TAMAM: v222 GitHub'da (%BR%) ve site yayinda.
pause
exit /b 0

:hata
echo.
echo HATA: yukaridaki adim basarisiz oldu, islem durduruldu.
pause
exit /b 1
