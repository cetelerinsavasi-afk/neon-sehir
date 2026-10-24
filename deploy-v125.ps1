# Neon Sehir v125 (kucuk guncelleme) - SADECE degisen fonksiyonlar
#   - Gazino gunluk raporu: 10 Numara raporu artik gun icinde sifirlanmiyor
#   - Fabrika makineleri: fiyat + %1 vergi (fabrika kurulus bedeli de buna gore)
#   - v124 gecisi saglamlastirildi (bir kayit hata verince tum gecis durmuyor) +
#     elle calistirma baglantisi: runV124MigrationsNow
#   - Depo kartinda "Al: x · Sat: y"
#   - 10 Numara: akilli kurpiyer (kartlar rastgele; acilan ellere gore en iyi hamle, beraberlik paylasilir)
#
# Calistirma (proje klasorunde, PowerShell'de):
#   powershell -ExecutionPolicy Bypass -File .\deploy-v125.ps1

$gruplar = @(
  @('createFactory', 'buyFactoryMachine', 'spinSlot', 'spinRoulette', 'buyLotteryTicket', 'createOnNumaraTable', 'joinOnNumaraTable', 'dealOnNumaraCards'),
  @('onNumaraHit', 'onNumaraStand', 'onNumaraAutoStand', 'dailyReset', 'dailyResetRecovery', 'v124Migrate', 'runV124MigrationsNow')
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
  Write-Host '  git commit -m "v125"' -ForegroundColor Green
  Write-Host '  git push' -ForegroundColor Green
} else {
  Write-Host "Su gruplar yuklenemedi, elle tekrar dene (git push'u bunlar bitince yap):" -ForegroundColor Red
  foreach ($g in $basarisiz) { Write-Host ("firebase deploy --only " + (($g | ForEach-Object { "functions:$_" }) -join ',')) }
}
