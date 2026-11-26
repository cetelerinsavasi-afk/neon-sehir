@echo off
REM Neon Sehir v217 - cete parasina not, ChatsApp en alttan acilir, Kostumler cokmesi, sekme sirasi.
REM Bu dosyayi proje klasorune (yayinla.bat'in yanina) koy ve cift tikla.
REM 0) neon-sehir-v217.zip'i proje klasorune acar (once bu klasorde, yoksa Indirilenler'de arar)
REM 1) cete testleri  2) derleme  3) gangAction fonksiyonu yayini  4) commit  5) push  6) Cloudflare
REM Sadece gangAction fonksiyonu yayinlanir: Firestore / RTDB kurallari ve indeksler DEGISMEZ.
REM Herhangi bir adim hata verirse durur; sonraki adimlar calismaz.
setlocal
cd /d "%~dp0"

echo.
echo === 0/6  Guncelleme dosyalari aciliyor (neon-sehir-v217.zip)
set "ZIP="
if exist "%~dp0neon-sehir-v217.zip" set "ZIP=%~dp0neon-sehir-v217.zip"
if not defined ZIP if exist "%USERPROFILE%\Downloads\neon-sehir-v217.zip" set "ZIP=%USERPROFILE%\Downloads\neon-sehir-v217.zip"
if not defined ZIP (
  echo neon-sehir-v217.zip bulunamadi. Zip'i bu klasore ya da Indirilenler'e koyup tekrar dene.
  goto hata
)
echo Zip: %ZIP%
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '%ZIP%' -DestinationPath '%~dp0.' -Force"
if errorlevel 1 goto hata
if not exist "src\components\ChatsAppScreen\useStickyChat.js" (
  echo Dosyalar dogru yere acilmadi.
  goto hata
)

echo.
echo === 1/6  Cete testleri (node --test)
pushd functions
call node --test gang/test/treasury.test.js gang/test/exploits.test.js
if errorlevel 1 (
  popd
  goto hata
)
popd

echo.
echo === 2/6  Derleniyor (npm run build)
call npm run build
if errorlevel 1 goto hata

echo.
echo === 3/6  Sunucu: gangAction fonksiyonu yayinlaniyor (para notu)
call npx firebase deploy --only functions:gangAction
if errorlevel 1 goto hata

echo.
echo === 4/6  Commit
git status --short
git add -A
REM Gizli dosyalar asla commit edilmez (eklenmis olsalar bile geri cikarilir)
git reset -q -- .env .env.local android-webview/keystore.properties android-webview/local.properties >nul 2>&1
git reset -q -- neon-sehir-v217.zip >nul 2>&1
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "v217: cete parasina not, ChatsApp en alttan acilir, Kostumler bellek cokmesi, kostum sekmesi basta"
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
echo TAMAM: v217 GitHub'da (%BR%), gangAction fonksiyonu ve site yayinda. Kurallar degismedi.
pause
exit /b 0

:hata
echo.
echo HATA: yukaridaki adim basarisiz oldu, islem durduruldu.
pause
exit /b 1
