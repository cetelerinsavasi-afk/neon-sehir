@echo off
REM Neon Sehir - derle, GitHub'a gonder (push), Cloudflare'a yayinla (wrangler deploy).
REM Herhangi bir adim hata verirse durur; sonraki adimlar calismaz.
setlocal
cd /d "%~dp0"

echo.
echo === 1/5  Degisen dosyalar
git status --short
echo.
set "MSG="
set /p "MSG=Commit mesaji (bos birakirsan otomatik yazilir): "
if "%MSG%"=="" set "MSG=Guncelleme %date% %time:~0,5%"
set "FB=h"
set /p "FB=Firebase (fonksiyonlar + kurallar) da yayinlansin mi? (e/h, varsayilan h): "

echo.
echo === 2/5  Derleniyor (npm run build)
call npm run build
if errorlevel 1 goto hata

echo.
echo === 3/5  Commit
git add -A
REM Gizli dosyalar asla commit edilmez (eklenmis olsalar bile geri cikarilir)
git reset -q -- .env .env.local android-webview/keystore.properties android-webview/local.properties >/dev/null 2>&1
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "%MSG%"
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

if /i "%FB%"=="e" (
  echo.
  echo === Ek  Firebase yayini
  call npx firebase deploy
  if errorlevel 1 goto hata
)

echo.
echo TAMAM: kod GitHub'da (%BR%), site yayinda.
echo Android derlemesi GitHub Actions'ta otomatik basladi.
pause
exit /b 0

:hata
echo.
echo HATA: yukaridaki adim basarisiz oldu, islem durduruldu.
pause
exit /b 1
