@echo off
REM Neon Sehir v216 - binekten firlama (cok oyunculu): test et, derle, RTDB kurallarini yayinla,
REM GitHub'a gonder (push), Cloudflare'a yayinla.
REM SIRA ONEMLI: RTDB kurali (yeni "fj" / "dn" alanlari) siteden ONCE yayinlanir; yoksa yeni surumdeki
REM motor / bisiklet kayitlari reddedilir ve diger oyunculara gorunmez.
REM Sadece Realtime Database kurallari yayinlanir: Firestore, fonksiyonlar, indeksler DEGISMEZ.
REM Herhangi bir adim hata verirse durur; sonraki adimlar calismaz.
setlocal
cd /d "%~dp0"

echo.
echo === 1/6  Firlama testleri (node --test)
call node --test tests/city/rider-eject.test.mjs tests/city/car-impact.test.mjs
if errorlevel 1 goto hata

echo.
echo === 2/6  Derleniyor (npm run build)
call npm run build
if errorlevel 1 goto hata

echo.
echo === 3/6  RTDB kurallari yayinlaniyor (sadece database)
call npx firebase deploy --only database
if errorlevel 1 goto hata

echo.
echo === 4/6  Commit
git status --short
git add -A
REM Gizli dosyalar asla commit edilmez (eklenmis olsalar bile geri cikarilir)
git reset -q -- .env .env.local android-webview/keystore.properties android-webview/local.properties >nul 2>&1
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "v216: binekten firlama - sert carpmada surucu ve arka yolcu firlar, diger oyuncular da gorur"
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
echo TAMAM: v216 GitHub'da (%BR%), RTDB kurallari ve site yayinda. Firestore degismedi.
pause
exit /b 0

:hata
echo.
echo HATA: yukaridaki adim basarisiz oldu, islem durduruldu.
pause
exit /b 1
