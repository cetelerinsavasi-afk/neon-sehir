@echo off
REM ============================================================================
REM Neon Sehir v169 - KUR + YAYINLA (tek tik)
REM  1) neon-sehir-v169.zip'i bulur (bu dosyanin yaninda / Indirilenler'de)
REM  2) Ustune yazilacak eski dosyalarin yedegini alir: neon-sehir\_v169\yedek
REM  3) Yeni dosyalari neon-sehir klasorune acar (sadece zip'teki dosyalar)
REM  4) deploy-v169.bat'i calistirir (derleme + test + fonksiyonlar + git push)
REM Bu dosyayi zip ile ayni yere (Indirilenler) ya da neon-sehir klasorune koy.
REM ============================================================================
setlocal
set "HERE=%~dp0"
if "%HERE:~-1%"=="\" set "HERE=%HERE:~0,-1%"

REM --- proje klasoru ---
set "PROJ="
if exist "%HERE%\package.json" if exist "%HERE%\.git" set "PROJ=%HERE%"
if not defined PROJ if exist "%HERE%\neon-sehir\package.json" set "PROJ=%HERE%\neon-sehir"
if not defined PROJ if exist "%USERPROFILE%\Downloads\neon-sehir\package.json" set "PROJ=%USERPROFILE%\Downloads\neon-sehir"
if not defined PROJ (
  echo neon-sehir proje klasoru bulunamadi. Bu dosyayi neon-sehir klasorune ya da yanina koy. HICBIR SEY YAPILMADI.
  goto son
)
if not exist "%PROJ%\.git" (
  echo "%PROJ%" icinde .git yok. HICBIR SEY YAPILMADI.
  goto son
)
echo Proje: %PROJ%

REM --- zip (en yenisi) ---
set "ZIP="
for %%D in ("%HERE%" "%PROJ%\.." "%USERPROFILE%\Downloads") do (
  if not defined ZIP for /f "delims=" %%Z in ('dir /b /o-d "%%~D\neon-sehir-v169*.zip" 2^>nul') do if not defined ZIP set "ZIP=%%~D\%%Z"
)
if not defined ZIP (
  echo neon-sehir-v169.zip bulunamadi ^(bu dosyanin yaninda ya da Indirilenler'de olmali^). HICBIR SEY YAPILMADI.
  goto son
)
echo Zip:   %ZIP%

echo.
echo ===== 1/2 yedek + yeni dosyalar aciliyor =====
set "NS_PROJ=%PROJ%"
set "NS_ZIP=%ZIP%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.IO.Compression.FileSystem; $p=$env:NS_PROJ; $bk=Join-Path $p '_v169\yedek'; $z=[IO.Compression.ZipFile]::OpenRead($env:NS_ZIP); try { $n=0; foreach($e in $z.Entries){ if([string]::IsNullOrEmpty($e.Name)){ continue }; $rel=$e.FullName -replace '/','\'; if($rel -match '\.\.'){ throw ('Gecersiz yol: '+$rel) }; $dst=Join-Path $p $rel; if(Test-Path $dst){ $b=Join-Path $bk $rel; New-Item -ItemType Directory -Force -Path (Split-Path $b) | Out-Null; if(-not (Test-Path $b)){ Copy-Item $dst $b -Force } }; New-Item -ItemType Directory -Force -Path (Split-Path $dst) | Out-Null; [IO.Compression.ZipFileExtensions]::ExtractToFile($e,$dst,$true); $n++ }; Write-Host ('  '+$n+' dosya acildi. Eski hali: '+$bk) } finally { $z.Dispose() }"
if errorlevel 1 (
  echo.
  echo Dosyalar acilamadi. HICBIR SEY GONDERILMEDI. Ciktiyi Claude'a gonder.
  goto son
)
if not exist "%PROJ%\functions\scripts\v169-hq-bot.test.mjs" (
  echo v169 dosyalari yerinde degil. HICBIR SEY GONDERILMEDI. Ciktiyi Claude'a gonder.
  goto son
)
if not exist "%PROJ%\deploy-v169.bat" (
  echo deploy-v169.bat yerinde degil. HICBIR SEY GONDERILMEDI. Ciktiyi Claude'a gonder.
  goto son
)

echo.
echo ===== 2/2 yayin (deploy-v169.bat) =====
call "%PROJ%\deploy-v169.bat"
goto bitti

:son
echo.
pause
:bitti
endlocal
