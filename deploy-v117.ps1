# Neon Sehir v117
#   v117: risksiz yasakli madde satisi 2.500 + cete 500; 2. el ilan yazilari sadelesti (sadece istemci)
#
# Calistirma (proje klasorunde, PowerShell'de):
#   powershell -ExecutionPolicy Bypass -File .\deploy-v117.ps1
#
# Sira: once sunucu fonksiyonlari, en son git push (istemci).

$gruplar = @(
  ,@('sellContrabandAtPark')
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
  Write-Host '  git commit -m "v117"' -ForegroundColor Green
  Write-Host '  git push' -ForegroundColor Green
} else {
  Write-Host "Su gruplar yuklenemedi, elle tekrar dene:" -ForegroundColor Red
  foreach ($g in $basarisiz) { Write-Host ("firebase deploy --only " + (($g | ForEach-Object { "functions:$_" }) -join ',')) }
}
