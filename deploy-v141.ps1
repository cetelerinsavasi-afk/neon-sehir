# Neon Sehir v141 - Basarilar (davet + belediye baskani), Kafe & Bar suphe cubugu,
#   seyyar satici harac +1000, iPhone mekan donmasi icin grafik hafifletme.
#   1) Sunucu fonksiyonlari 3 kucuk grupta (kota dolmasin diye aralarda bekler)
#   2) Hepsi basariliysa git commit + push (arayuz)
#   Cift tikla: deploy-v141.bat   - soru sormaz.
# DIKKAT: 23:00-01:00 ve 17:45-19:15 arasinda calismaz.

$ErrorActionPreference = 'Continue'
Set-Location -Path $PSScriptRoot
$env:GIT_ASK_YESNO = 'false'

$tr = [System.TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow, 'Turkey Standard Time')
if ($tr.Hour -ge 23 -or $tr.Hour -lt 1) {
  Write-Host "Saat $($tr.ToString('HH:mm')) - gece 23:00 ile 01:00 arasinda yukleme yapma." -ForegroundColor Red
  exit 1
}
# cronTick 18:00 ve 19:00'da futbol islerini calistiriyor; o sirada yeniden yuklenmesin (v138 kurali)
$dk = $tr.Hour * 60 + $tr.Minute
if ($dk -ge (17 * 60 + 45) -and $dk -lt (19 * 60 + 15)) {
  Write-Host "Saat $($tr.ToString('HH:mm')) - 17:45 ile 19:15 arasinda (futbol isleri) yukleme yapma. 19:15'ten sonra tekrar cift tikla." -ForegroundColor Red
  exit 1
}

$gruplar = @(
  @('shopAction', 'applyReferralCode', 'syncAchievements', 'attemptHeist'),
  @('createHeistPlan', 'executeHeistPlan', 'refreshHeistPlanParticipants', 'politicsAction', 'belediyeAction'),
  @('cronTick', 'dailyReset', 'dailyResetRecovery')
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
foreach ($f in @('deploy-v140.ps1','deploy-v140.bat')) {
  if (Test-Path $f) { git rm -q -f -- $f 2>$null; if (Test-Path $f) { Remove-Item -Force $f } }
}
git add -- functions/achievements.js functions/achievementsData.js functions/belediye.js functions/index.js functions/venue.js functions/scripts/achievements.test.mjs functions/scripts/venue.test.mjs src/components/AchievementsScreen/AchievementsScreen.css src/components/AchievementsScreen/AchievementsScreen.jsx src/components/HeistPanel/HeistPanel.jsx src/components/HomeScreen/HomeScreen.jsx src/components/HouseScreen/HouseScreen.jsx src/components/HouseScreen/houseEngine.js src/components/MekanlarScreen/SuspicionTab.css src/components/MekanlarScreen/SuspicionTab.jsx V141-DEGISIKLIKLER.md deploy-v141.ps1 deploy-v141.bat
git commit -q -m "v141: basarilar (davet 10 asama + belediye baskani), kafe & bar suphe cubugu, harac +1000, iPhone mekan grafik hafifletme" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01YQymXLirxVX3AzEcXXxgJv"
git push
if ($LASTEXITCODE -ne 0) {
  Write-Host "git push basarisiz. Sunucu guncel ama arayuz eski. Ciktiyi Claude'a gonder." -ForegroundColor Red
  exit 1
}
Write-Host ""
Write-Host "TAMAM: v141 canlida." -ForegroundColor Green
