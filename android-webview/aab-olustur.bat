@echo off
setlocal EnableDelayedExpansion
REM Neon Sehir (WebView) - Play Store icin imzali AAB uretir.
REM Cift tiklayin ya da bu klasorde komut satirindan calistirin.
cd /d "%~dp0"

REM ---- 1) Java 17 -------------------------------------------------------
if not defined JAVA_HOME (
  for /d %%J in ("%USERPROFILE%\.bubblewrap\jdk\jdk-17*") do set "JAVA_HOME=%%~fJ"
)
if not defined JAVA_HOME (
  for /d %%J in ("C:\Program Files\Android\Android Studio\jbr") do set "JAVA_HOME=%%~fJ"
)
if not defined JAVA_HOME (
  echo [HATA] Java 17 bulunamadi. README.md - "1. Gerekenler" bolumune bakin.
  pause & exit /b 1
)
echo  Java      : %JAVA_HOME%

REM ---- 2) Android SDK (local.properties) ----------------------------------
if not exist "local.properties" (
  set "SDK="
  if defined ANDROID_HOME set "SDK=%ANDROID_HOME%"
  if not defined SDK if exist "%USERPROFILE%\.bubblewrap\android_sdk" set "SDK=%USERPROFILE%\.bubblewrap\android_sdk"
  if not defined SDK if exist "%LOCALAPPDATA%\Android\Sdk" set "SDK=%LOCALAPPDATA%\Android\Sdk"
  if not defined SDK (
    echo [HATA] Android SDK bulunamadi. README.md - "1. Gerekenler" bolumune bakin.
    pause & exit /b 1
  )
  set "SDKESC=!SDK:\=\\!"
  > local.properties echo sdk.dir=!SDKESC!
)
for /f "tokens=1,* delims==" %%a in (local.properties) do if "%%a"=="sdk.dir" echo  Android SDK: %%b

REM ---- 3) Imza ayarlari ----------------------------------------------------
if not exist "keystore.properties" (
  echo [HATA] keystore.properties yok. keystore.properties.example dosyasini
  echo        keystore.properties adiyla kopyalayip sifreleri yazin.
  pause & exit /b 1
)

REM ---- 4) Derle --------------------------------------------------------------
call gradlew.bat --no-daemon clean bundleRelease
if errorlevel 1 (
  echo.
  echo [HATA] Derleme basarisiz. Yukaridaki ilk "What went wrong" mesajina bakin,
  echo        README.md - "Sik karsilasilan hatalar" bolumu. Cozemezseniz mesaji Claude'a gonderin.
  pause & exit /b 1
)

set "OUT=app\build\outputs\bundle\release\app-release.aab"
if not exist "%OUT%" (
  echo [HATA] AAB bulunamadi: %OUT%
  pause & exit /b 1
)
for /f "tokens=3" %%v in ('findstr /r /c:"versionCode = [0-9]" app\build.gradle.kts') do set VC=%%v
copy /y "%OUT%" "NeonSehir-webview-v%VC%.aab" >nul
echo.
echo  ==============================================================
echo   HAZIR:  NeonSehir-webview-v%VC%.aab
echo   Play Console ^> Test edin ve yayinlayin ^> Dahili test ^>
echo   Yeni surum olustur kismina bu dosyayi surukleyin.
echo  ==============================================================
explorer /select,"%CD%\NeonSehir-webview-v%VC%.aab"
pause
