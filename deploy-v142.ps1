# Neon Sehir v142 - Polis tir operasyonu 10.000, yakalanan tirin mallari imha + siparis parasi devlete,
#   cezali menajerler (baskan cezayi kaldirir), siparis paneli (en cok bakiye once + alt alta liste),
#   kafe & bar sag ust -10 suphe, park sag ust Supheli adam, depolarda piyasa (oyunun deposu en ucuz oyuncu deposundan satar).
#   1) Sunucu fonksiyonlari 3 kucuk grupta (kota dolmasin diye aralarda bekler)
#   2) Hepsi basariliysa git commit + push (arayuz)
#   Cift tikla: deploy-v142.bat   - soru sormaz.
# DIKKAT: 23:00-01:00 ve 17:45-19:15 arasinda calismaz.

$ErrorActionPreference = 'Continue'
Set-Location -Path $PSScriptRoot
$env:GIT_ASK_YESNO = 'false'

$tr = [System.TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow, 'Turkey Standard Time')
if ($tr.Hour -ge 23 -or $tr.Hour -lt 1) {
  Write-Host "Saat $($tr.ToString('HH:mm')) - gece 23:00 ile 01:00 arasinda (tirlar depoya variyor) yukleme yapma." -ForegroundColor Red
  exit 1
}
$dk = $tr.Hour * 60 + $tr.Minute
if ($dk -ge (17 * 60 + 45) -and $dk -lt (19 * 60 + 15)) {
  Write-Host "Saat $($tr.ToString('HH:mm')) - 17:45 ile 19:15 arasinda (futbol isleri) yukleme yapma. 19:15'ten sonra tekrar cift tikla." -ForegroundColor Red
  exit 1
}

$gruplar = @(
  @('unbanFutbolManager', 'listFutbolManagerApplications'),
  @('gangAction', 'cronTick'),  # v138'den beri gangClock ayri fonksiyon degil, cronTick icinde calisir
  @('shopAction', 'houseAction')
)
$basarisiz = @()
$i = 0
foreach ($g in $gruplar) {
  $i++
  $only = ($g | ForEach-Object { "functions:$_" }) -join ','
  $tamam = $false
  for ($deneme = 1; $deneme -le 3 -and -not $tamam; $deneme++) {
    Write-Host ""
    Write-Host "===== Grup $i / $($gruplar.Count): $($g -join ', ') (deneme $deneme / 3) =====" -ForegroundColor Cyan
    firebase deploy --only $only --non-interactive
    if ($LASTEXITCODE -eq 0) { $tamam = $true }
    elseif ($deneme -lt 3) { Write-Host "Yuklenemedi, 90 sn sonra tekrar..." -ForegroundColor Yellow; Start-Sleep -Seconds 90 }
  }
  if (-not $tamam) { $basarisiz += $g }
  if ($i -lt $gruplar.Count) { Write-Host "Kota dolmasin diye 45 sn bekleniyor..." -ForegroundColor DarkGray; Start-Sleep -Seconds 45 }
}
if ($basarisiz.Count -gt 0) {
  Write-Host ""
  Write-Host "Yuklenemeyenler: $($basarisiz -join ', '). git push YAPILMADI. Birkac dakika sonra bu dosyayi tekrar calistir ya da ciktiyi Claude'a gonder." -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "===== git commit + push (arayuz) =====" -ForegroundColor Cyan
foreach ($f in @('deploy-v141-3.ps1','deploy-v141-3.bat')) {
  if (Test-Path $f) { git rm -q -f -- $f 2>$null; if (Test-Path $f) { Remove-Item -Force $f } }
}
git add -- functions/gang/actions/wars.js functions/gang/clock.js functions/gang/config.js functions/gang/test/intel.test.js functions/gang/test/betintel.test.js functions/index.js src/components/FutbolScreen/FutbolMenajer.jsx src/components/FutbolScreen/FutbolTakimim.css src/components/Gangs/Gangs.css src/components/Gangs/tabs/OpsTab.jsx src/components/Gangs/tabs/TradeTab.jsx src/components/GuideScreen/guideContent.js src/components/HouseScreen/HouseScreen.jsx src/components/Venue/Venue.css src/components/Venue/CafeCalmButton.jsx src/components/Venue3D/venueParts.jsx src/services/gameActions.js functions/depo.js functions/scripts/depo.test.mjs src/hooks/useDepoMarket.js src/components/Depo/DepoPanels.jsx src/components/Depo/Depo.css src/components/BusinessHub/BusinessHub.jsx V142-DEGISIKLIKLER.md deploy-v142.ps1 deploy-v142.bat
git commit -q -m "v142: depolarda piyasa sistemi, polis operasyonlari 10.000, yakalanan tir mallari imha + siparis parasi devlete, cezali menajerler, siparis paneli, kafe -10 suphe, park supheli adam butonu" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01YQymXPfWsmWM5K5TViTPig"
git push
if ($LASTEXITCODE -ne 0) {
  Write-Host "git push basarisiz. Sunucu guncel ama arayuz eski. Ciktiyi Claude'a gonder." -ForegroundColor Red
  exit 1
}
Write-Host ""
Write-Host "TAMAM: v142 canlida." -ForegroundColor Green
