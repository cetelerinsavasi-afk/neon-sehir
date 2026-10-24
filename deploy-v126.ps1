# Neon Sehir v126 - SADECE degisen fonksiyonlar
#   - Oyunun gazinosu: karin TAMAMI devlete
#       slot 1.600 (200 devlete, 1.400 cop) - gece 00:00'da devlete yatar
#       piyango biletinden 10 altin devlete (gazinoya vergi yok; kazananin odulune %10 vergi aynen)
#       rulet ve 10 Numara: ayri kasalar; gece artidaysa devlete, eksideyse eksiden devam
#   - Belediye raporu: gece 00:00'daki fabrika vergisi YENI gune yaziliyor
#   - Fabrika makinesi alim vergisi %1 -> %5
#
# Calistirma (proje klasorunde, PowerShell'de):
#   powershell -ExecutionPolicy Bypass -File .\deploy-v126.ps1

$gruplar = @(
  @('createFactory', 'buyFactoryMachine', 'spinSlot', 'spinRoulette', 'dealOnNumaraCards', 'onNumaraHit', 'onNumaraStand'),
  @('onNumaraAutoStand', 'dailyReset', 'dailyResetRecovery', 'resolveStuckRewardsNow', 'getStateReport')
)

$basarisiz = @()
$i = 0
foreach ($g in $gruplar) {
  $i++
  $only = ($g | ForEach-Object { "functions:$_" }) -join ','
  Write-Host ""
  Write-Host "===== Grup $i / $($gruplar.Count): $($g -join ', ') =====" -ForegroundColor Cyan
  firebase deploy --only $only
  $deneme = 1
  while ($LASTEXITCODE -ne 0 -and $deneme -le 2) {
    Write-Host "Hata. 120 sn bekleyip tekrar deneniyor ($deneme / 2)..." -ForegroundColor Yellow
    Start-Sleep -Seconds 120
    firebase deploy --only $only
    $deneme++
  }
  if ($LASTEXITCODE -ne 0) { $basarisiz += ,$g }
  if ($i -lt $gruplar.Count) { Start-Sleep -Seconds 45 }
}

Write-Host ""
if ($basarisiz.Count -eq 0) {
  Write-Host "TAMAM: Fonksiyonlar yuklendi. Simdi istemci icin:" -ForegroundColor Green
  Write-Host '  git add -A' -ForegroundColor Green
  Write-Host '  git commit -m "v126"' -ForegroundColor Green
  Write-Host '  git push' -ForegroundColor Green
} else {
  Write-Host "Su gruplar yuklenemedi, elle tekrar dene (git push'u bunlar bitince yap):" -ForegroundColor Red
  foreach ($g in $basarisiz) { Write-Host ("firebase deploy --only " + (($g | ForEach-Object { "functions:$_" }) -join ',')) }
}
