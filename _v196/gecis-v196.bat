@echo off
REM ============================================================================
REM Neon Sehir v196 GECIS - sirayla: 1 Yedek, 2 Yedek durumu (ok:true olana kadar), 3 Kapat,
REM 4 Deneme (raporu Claude'a gonder, ONAY BEKLE), sonra yukle-v196.bat, sonra 5 Uygula, 6 Durum.
REM Uygula geri alinmaz (yedek bu yuzden). 23:30-00:40 arasi uygula kapalidir (gece isleri).
REM ============================================================================
setlocal EnableDelayedExpansion
set "U=https://europe-west1-neon-sehir.cloudfunctions.net/runV196MigrationNow?secret=854f8bf3de15bf540bd36a26a3cce7e5"
:menu
echo.
echo  1  Yedek al (Firestore disari aktarma)
echo  2  Yedek durumu
echo  3  Kapat (kapanis modu)
echo  4  Deneme (dryRun - hicbir sey degismez, rapor yazar)
echo  5  Uygula (apply - rapor kimligi ister; partial:true ise tekrar calistir)
echo  6  Durum (status)
echo  7  Elle yedek kaydet (gcloud ile alinan gs:// yolu)
echo  0  Cikis
set "S="
set /p "S=Secim: "
if "%S%"=="1" call :git "op=backup"
if "%S%"=="2" call :git "op=backupStatus"
if "%S%"=="3" call :git "op=close"
if "%S%"=="4" call :git "op=dryRun"
if "%S%"=="5" (
  set "RID="
  set /p "RID=Rapor kimligi (Deneme/Durum ciktisindaki reportId): "
  if "!RID!"=="" (echo Kimlik bos. & goto menu)
  call :git "op=apply&approve=!RID!"
)
if "%S%"=="6" call :git "op=status"
if "%S%"=="7" (
  set "GP="
  set /p "GP=gs:// yolu: "
  if "!GP!"=="" (echo Yol bos. & goto menu)
  call :git "op=backupManual&path=!GP!"
)
if "%S%"=="0" goto :eof
goto menu

:git
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; try { $r = Invoke-RestMethod -TimeoutSec 600 -Uri ('%U%&' + '%~1'); $j = $r | ConvertTo-Json -Depth 8; Write-Host $j -ForegroundColor Green; $j | Out-File -Encoding utf8 -FilePath ('%~dp0gecis-son.txt') } catch { Write-Host ('HATA: ' + $_.Exception.Message) -ForegroundColor Red; try { $s = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream()); Write-Host $s.ReadToEnd() -ForegroundColor Red } catch {} }"
echo   (cikti ayrica _v196\gecis-son.txt dosyasinda - Claude'a gonderebilirsin)
exit /b
