@echo off
REM Neon Sehir v220 - park (buyuk toplar, telefonda basket / helikopter, sahalara kapidan giris), pazar (sabit pazarcilar, kasma),
REM La Marea (bariyer, ismarla), kostumcu paneli, pardosu, kambur durus, yatak / havuz / sezlong / sauna, internet kafe,
REM yayin kamerasi, cokme / kasma duzeltmeleri, kos dugmesi kalkti, mini haritada "MAGAZALAR".
REM Dosyalar Claude tarafindan dogrudan proje klasorune yazildi (zip yok).
REM 1) testler  2) derleme  3) RTDB kurallari  4) commit  5) push  6) Cloudflare
REM Fonksiyonlar, Firestore kurallari ve indeksleri DEGISMEDI. Herhangi bir adim hata verirse durur.
setlocal
cd /d "%~dp0"

echo.
echo === 0/6  Eski yayin dosyalari siliniyor
for %%f in (v219-yayinla.bat firebase-debug.log firestore-debug.log database-debug.log ui-debug.log) do (
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
echo === 1/6  Testler (node --test)
call node --test tests/city/kurye.test.mjs tests/city/nav-route.test.mjs tests/ui/borsa-ui.test.mjs tests/ui/force-update.test.mjs
if errorlevel 1 goto hata

echo.
echo === 2/6  Derleniyor (npm run build)
call npm run build
if errorlevel 1 goto hata

echo.
echo === 3/6  RTDB kurallari yayinlaniyor (city/p: hm, y, lz alanlari)
call npx firebase deploy --only database
if errorlevel 1 goto hata

echo.
echo === 4/6  Commit
git status --short
git add -A
REM Gizli dosyalar asla commit edilmez
git reset -q -- .env .env.local android-webview/keystore.properties android-webview/local.properties >nul 2>&1
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "v220: park toplari ve telefonda basket/helikopter, sahalara kapidan giris, sabit pazarcilar + NPC siniri, La Marea duzeltmeleri, kostumcu paneli, pardosu, dik durus, yatak/havuz/sezlong/sauna, internet kafe, yayin kamerasi, cokme/kasma duzeltmeleri, hep hizli yuru" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01YQymXKtGxkNRZqtuphmrE6"
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
echo TAMAM: v220 GitHub'da (%BR%), RTDB kurallari ve site yayinda.
pause
exit /b 0

:hata
echo.
echo HATA: yukaridaki adim basarisiz oldu, islem durduruldu.
pause
exit /b 1
