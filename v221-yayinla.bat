@echo off
REM Neon Sehir v221 - belediye salonu (buyuk), Caycı Hasan cay/kahve getirir, kaykay (motor gibi, 20 gun omur, digerleri gorur),
REM basket (elinden al / zipla), seyyar saticilar (festival menu, yol kenari alisveris, vergi yok), Kervankent benzinlik + camii,
REM uzak avatar 3D'den, hastane yatagi, cafe / bar ic tasarim, NPC yonleri, tabelalar, banka bariyerleri, internet kafe tezgahi.
REM Dosyalar Claude tarafindan dogrudan proje klasorune yazildi (zip yok).
REM 1) testler  2) derleme  3) RTDB kurallari  4) fonksiyonlar  5) commit  6) push  7) Cloudflare
REM Firestore kurallari ve indeksleri DEGISMEDI. Herhangi bir adim hata verirse durur.
setlocal
cd /d "%~dp0"

echo.
echo === 0/7  Eski yayin dosyalari siliniyor
for %%f in (v220-yayinla.bat firebase-debug.log firestore-debug.log database-debug.log ui-debug.log) do (
  if exist "%%f" (
    del /q "%%f"
    echo silindi: %%f
  )
)
for %%z in (neon-sehir-v2*.zip) do (
  del /q "%%z"
  echo silindi: %%z
)

echo.
echo === 1/7  Testler (node --test)
call node --test tests/city/kurye.test.mjs tests/city/nav-route.test.mjs tests/ui/borsa-ui.test.mjs tests/ui/force-update.test.mjs
if errorlevel 1 goto hata

echo.
echo === 2/7  Derleniyor (npm run build)
call npm run build
if errorlevel 1 goto hata

echo.
echo === 3/7  RTDB kurallari yayinlaniyor (city/p: k = kaykayda)
call npx firebase deploy --only database
if errorlevel 1 goto hata

echo.
echo === 4/7  Fonksiyonlar yayinlaniyor (seyyar satici geliri / vergi, yol kenari alisveris, kaykay omru, fotograf)
call npx firebase deploy --only functions
if errorlevel 1 goto hata

echo.
echo === 5/7  Commit
git status --short
git add -A
REM Gizli dosyalar asla commit edilmez
git reset -q -- .env .env.local android-webview/keystore.properties android-webview/local.properties >nul 2>&1
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "v221: buyuk belediye salonu + caycı servisi, kaykay motor gibi (20 gun), basket elinden al/zipla, seyyar satici ekonomisi, Kervankent benzinlik + camii, uzak avatar 3D, hastane yatagi, cafe/bar tasarim, NPC yonleri, tabela/bariyer/tezgah duzeltmeleri" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01YQymXPgqVP7H8HBmzk9AMT"
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
echo TAMAM: v221 GitHub'da (%BR%), RTDB kurallari, fonksiyonlar ve site yayinda.
pause
exit /b 0

:hata
echo.
echo HATA: yukaridaki adim basarisiz oldu, islem durduruldu.
pause
exit /b 1
