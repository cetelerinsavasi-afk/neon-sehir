# Neon Sehir v114 + v115
#   v114: tavan modu, yayinda mac (izleyici sadece izler, sohbet ustte), kupa turu odulleri  -> sadece istemci
#   v115: 2. el arac/silah ilan kurallari, galerici/silahci vitrini, risksiz yasakli madde hatirlatmasi
#
# Calistirma (proje klasorunde, PowerShell'de):
#   powershell -ExecutionPolicy Bypass -File .\deploy-v115.ps1
#
# Sira: once sunucu fonksiyonlari, en son git push (istemci).

$gruplar = @(
  @('createListing', 'cancelListing', 'buyListing', 'shopAction', 'houseAction'),
  @('dailyReset', 'dailyResetRecovery', 'settleMaterialListingBatches', 'expireOldMarketplaceListings')
)

$basarisiz = @()
function Yukle($g, $etiket) {
  $only = ($g | ForEach-Object { "functions:$_" }) -join ','
  Write-Host ""
  Write-Host "===== $etiket : $($g -join ', ') =====" -ForegroundColor Cyan
  firebase deploy --only $only
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Hata. 120 sn bekleyip bir kez daha deneniyor..." -ForegroundColor Yellow
    Start-Sleep -Seconds 120
    firebase deploy --only $only
    if ($LASTEXITCODE -ne 0) { $script:basarisiz += ,$g }
  }
  Start-Sleep -Seconds 30
}

$i = 0
foreach ($g in $gruplar) { $i++; Yukle $g "Grup $i / $($gruplar.Count)" }

Write-Host ""
if ($basarisiz.Count -eq 0) {
  Write-Host "TAMAM: Fonksiyonlar yuklendi. Simdi istemci icin:" -ForegroundColor Green
  Write-Host '  git add -A' -ForegroundColor Green
  Write-Host '  git commit -m "v114 + v115"' -ForegroundColor Green
  Write-Host '  git push' -ForegroundColor Green
} else {
  Write-Host "Su gruplar yuklenemedi, elle tekrar dene:" -ForegroundColor Red
  foreach ($g in $basarisiz) { Write-Host ("firebase deploy --only " + (($g | ForEach-Object { "functions:$_" }) -join ',')) }
}
