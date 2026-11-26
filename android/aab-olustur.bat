@echo off
setlocal
REM Neon Sehir - Play Store icin yeni AAB olusturur.
REM Bu dosyayi projedeki "android" klasorune koyup cift tiklayin.
cd /d "%~dp0"

if not exist "app\build.gradle" (
  echo [HATA] Bu dosya "android" klasorunun icinde olmali ^(app\build.gradle bulunamadi^).
  pause & exit /b 1
)

where bubblewrap >nul 2>nul
if errorlevel 1 (
  echo [HATA] Bubblewrap bulunamadi. Once su komutu calistirin:  npm i -g @bubblewrap/cli
  pause & exit /b 1
)

for /f "tokens=2" %%v in ('findstr /r /c:"versionCode [0-9]" app\build.gradle') do set CUR=%%v
set /a NEXT=CUR+1

echo.
echo  Su anki surum kodu : %CUR%
echo  Play Console ^> Test ^> Kapali test ^> Surumler kismindaki EN YUKSEK surum kodundan
echo  buyuk bir sayi girin. Emin degilseniz Enter'a basin.
echo.
set /p NEW= Yeni surum kodu [Enter = %NEXT%]:
if "%NEW%"=="" set NEW=%NEXT%

copy /y "app\build.gradle" "app\build.gradle.yedek" >nul
powershell -NoProfile -Command "$p='app\build.gradle'; $t=[IO.File]::ReadAllText($p); $t=$t -replace 'versionCode \d+','versionCode %NEW%'; $t=$t -replace 'versionName \"[^\"]*\"','versionName \"1.0.%NEW%\"'; [IO.File]::WriteAllText($p,$t)"
if errorlevel 1 (
  echo [HATA] Surum kodu yazilamadi.
  pause & exit /b 1
)
echo  Surum kodu %NEW%, surum adi 1.0.%NEW% olarak ayarlandi.
echo.
echo  Simdi keystore sifreleri sorulacak (android.keystore icin daha once belirlediginiz sifreler).
echo  "Proje guncellensin mi / update project" diye sorarsa  N  yazin.
echo.

if exist "app-release-bundle.aab" del /q "app-release-bundle.aab"
call bubblewrap build --skipPwaValidation

if not exist "app-release-bundle.aab" (
  echo.
  echo [HATA] AAB olusmadi. Yukaridaki hata mesajini Claude'a gonderin.
  echo        build.gradle eski haline donduruldu.
  copy /y "app\build.gradle.yedek" "app\build.gradle" >nul
  pause & exit /b 1
)

copy /y "app-release-bundle.aab" "NeonSehir-v%NEW%.aab" >nul
echo.
echo  ==============================================================
echo   HAZIR:  NeonSehir-v%NEW%.aab
echo   Play Console ^> Test ^> Kapali test ^> Yeni surum olustur
echo   kismina bu dosyayi surukleyin.
echo  ==============================================================
explorer /select,"%CD%\NeonSehir-v%NEW%.aab"
pause
