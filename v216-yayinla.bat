@echo off
REM Neon Sehir v216 - binekten firlama: test et, derle, GitHub'a gonder (push), Cloudflare'a yayinla.
REM Firebase'e (fonksiyon / kural / Firestore) DOKUNMAZ: bu guncellemede sunucu tarafi degismedi.
REM Herhangi bir adim hata verirse durur; sonraki adimlar calismaz.
setlocal
cd /d "%~dp0"

echo.
echo === 1/5  Firlama testleri (node --test)
call node --test tests/city/rider-eject.test.mjs tests/city/car-impact.test.mjs
if errorlevel 1 goto hata

echo.
echo === 2/5  Derleniyor (npm run build)
call npm run build
if errorlevel 1 goto hata

echo.
echo === 3/5  Commit
git status --short
git add -A
REM Gizli dosyalar asla commit edilmez (eklenmis olsalar bile geri cikarilir)
git reset -q -- .env .env.local android-webview/keystore.properties android-webview/local.properties >nul 2>&1
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "v216: binekten firlama (motor, bisiklet, at, deve) - sert carpmada surucu firlar"
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
echo TAMAM: v216 GitHub'da (%BR%), site yayinda. Firebase degismedi.
pause
exit /b 0

:hata
echo.
echo HATA: yukaridaki adim basarisiz oldu, islem durduruldu.
pause
exit /b 1
