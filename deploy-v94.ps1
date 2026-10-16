# Neon Sehir v93 + v94 - degisen kurallar ve fonksiyonlar (gruplar halinde, kota dolmasin diye aralikli).
# Calistirma (proje klasorunde, PowerShell'de):
#   powershell -ExecutionPolicy Bypass -File .\deploy-v94.ps1

Write-Host "===== Firestore kurallari =====" -ForegroundColor Cyan
firebase deploy --only firestore:rules

$gruplar = @(
  @('shopAction', 'houseAction', 'createSixtagramPost', 'businessRollover'),
  @('gangAction', 'gangClock', 'dailyReset'),
  @('dealOnNumaraCards', 'onNumaraHit', 'onNumaraStand', 'onNumaraAutoStand', 'raceHubAction'),
  @('streamAction', 'ensureFactoryMigrationsV38', 'produceAtFactory', 'buyFactoryMachine', 'createFactory'),
  @('getFactoryValue', 'getCreditInfo', 'takeCredit', 'createListing', 'instantSellListing'),
  @('attemptHeist', 'sellContrabandAtPark', 'executeHeistPlan')
)

$basarisiz = @()
$i = 0
foreach ($g in $gruplar) {
  $i++
  $only = ($g | ForEach-Object { "functions:$_" }) -join ','
  Write-Host ""
  Write-Host "===== Grup $i / $($gruplar.Count): $($g -join ', ') =====" -ForegroundColor Cyan
  firebase deploy --only $only
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Bu grup hata verdi. 120 sn bekleyip bir kez daha deneniyor..." -ForegroundColor Yellow
    Start-Sleep -Seconds 120
    firebase deploy --only $only
    if ($LASTEXITCODE -ne 0) { $basarisiz += $g }
  }
  if ($i -lt $gruplar.Count) {
    Write-Host "Kota dolmasin diye 60 sn bekleniyor..." -ForegroundColor DarkGray
    Start-Sleep -Seconds 60
  }
}

Write-Host ""
if ($basarisiz.Count -eq 0) {
  Write-Host "TAMAM: Tum gruplar basariyla yuklendi." -ForegroundColor Green
} else {
  Write-Host "Hala yuklenemeyenler: $($basarisiz -join ', ')" -ForegroundColor Red
  Write-Host "Birkac dakika sonra bu dosyayi tekrar calistir ya da bu ciktiyi Claude'a gonder."
}
