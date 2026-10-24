# Neon Sehir v123
#   - Polis Teskilati: basvuru formu kalkti, kod adiyla aninda katilim; yeni polis 24 saat atilamaz;
#     sicilde form bilgisi yok
#   - Suphe 50+ iken suc yok (tek soygun / harac / ekip soygunu / park satisi)
#   - Futbolcu, menajer, fabrika iscisi maaslarindan %10 vergi
#   - Piyango kazancindan %10 vergi (SMS + belediye defteri)
#   - Ekip soygunu "polis yakaladi" dali defter duzeltmesi (cift sayim)
#
# Calistirma (proje klasorunde, PowerShell'de):
#   powershell -ExecutionPolicy Bypass -File .\deploy-v123.ps1
#
# Sira: once sunucu fonksiyonlari, en son git push (istemci).

$gruplar = @(
  @('gangAction', 'gangClock'),
  @('attemptHeist', 'sellContrabandAtPark', 'createHeistPlan', 'joinHeistPlan', 'executeHeistPlan'),
  @('produceAtFactory', 'futbolProAction', 'resolveFutbolMatchdayReveal', 'futbolTransferMarketHourlyMaintenance'),
  @('dailyReset', 'dailyResetRecovery', 'resolveStuckRewardsNow', 'getStateReport')
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
  Write-Host '  git commit -m "v123"' -ForegroundColor Green
  Write-Host '  git push' -ForegroundColor Green
} else {
  Write-Host "Su gruplar yuklenemedi, elle tekrar dene:" -ForegroundColor Red
  foreach ($g in $basarisiz) { Write-Host ("firebase deploy --only " + (($g | ForEach-Object { "functions:$_" }) -join ',')) }
}
