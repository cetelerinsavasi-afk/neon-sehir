# Neon Sehir v160.4 - belediye garson + tek secim/darbe dugmesi, 'amk' serbest, karargah yol tarifi duzeltmesi + v160.3: mekan ici paneller (Ceteler/Soygun/Profil/Hatirlatmalar), 5 sekmeli cete paneli,
#   baska cetenin karargahinda Cete bilgisi, secim hatirlatmasi (Belediyeye git), hizli kosu varsayilan,
#   yeni 1. gorev (mini haritadan isinlan), hizli Fabrikalar, kostum renkleri (bilgisayar).
#   Bu betik:
#   1) derleme + testler
#   2) fonksiyonlar gruplar halinde (gorev + kufur filtresi kullananlar)
#   3) git commit + push   4) Cloudflare derlemesini bekler, sonucu soyler

$ErrorActionPreference = 'Continue'
Set-Location -Path $PSScriptRoot
$env:GIT_ASK_YESNO = 'false'
function Dur($mesaj) { Write-Host ""; Write-Host $mesaj -ForegroundColor Red; exit 1 }

if (-not (Test-Path 'package.json') -or -not (Test-Path 'src\components\City\cityEngine.js')) { Dur "Bu dosya neon-sehir proje klasorunun ICINDE olmali." }
if (-not (Test-Path 'src\components\Gangs\GangPanel.jsx') -or -not (Test-Path 'src\components\City\VenueHud.jsx')) { Dur "v160.3 dosyalari bulunamadi. HICBIR SEY YAPILMADI." }

Write-Host ""
Write-Host "===== arayuz derleme kontrolu =====" -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { Dur "Arayuz derlenemedi. HICBIR SEY YUKLENMEDI. Ciktiyi Claude'a gonder." }

$testler = @('tests/webview/webview.test.mjs', 'tests/city/jobs-resume.test.mjs', 'tests/city/kurye.test.mjs', 'functions/scripts/onboarding.test.mjs', 'functions/scripts/profanity.test.mjs', 'functions/scripts/six-image.test.mjs') | Where-Object { Test-Path $_ }
if ($testler.Count -gt 0) {
  Write-Host ""
  Write-Host "===== testler =====" -ForegroundColor Cyan
  node --test @testler
  if ($LASTEXITCODE -ne 0) { Dur "Testler basarisiz. HICBIR SEY YUKLENMEDI. Ciktiyi Claude'a gonder." }
}

function Yukle($only, $ad) {
  foreach ($bekle in @(0, 30, 90)) {
    if ($bekle -gt 0) {
      Write-Host "$ad tamamlanmadi, $bekle sn bekleyip tekrar deneniyor..." -ForegroundColor Yellow
      Start-Sleep -Seconds $bekle
    }
    firebase deploy --only $only
    if ($LASTEXITCODE -eq 0) { return $true }
  }
  return $false
}

Write-Host ""
Write-Host "===== fonksiyonlar (gruplar halinde) =====" -ForegroundColor Cyan
$gruplar = @(
  @('checkOnboardingProgress', 'produceAtFactory', 'sendChatMessage', 'socialAction', 'cityAction', 'houseAction'),
  @('createSixtagramPost', 'createSixtagramComment', 'gangAction', 'belediyeAction', 'politicsAction', 'streamAction'),
  @('setDisplayName', 'setAvatar', 'futbolProAction', 'createFactory', 'setFactoryName', 'renameVehicle'),
  @('giveNasihat', 'becomeBeggar', 'createHeistPlan', 'updateHeistPlanNote', 'createRaceRoom', 'createOnNumaraTable'),
  @('openFutbolTreasuryWithdrawRequest', 'sendFactorySponsorshipOffer', 'sendClubSponsorshipOffer', 'updateSponsorshipNote', 'submitFeedback', 'recordVenueVisit'),
  @('reportContent', 'blockUser', 'unblockUser', 'getPlayerCard')
)
$gi = 0
foreach ($g in $gruplar) {
  $gi++
  $only = ($g | ForEach-Object { "functions:$_" }) -join ','
  Write-Host ""
  Write-Host "--- Grup $gi / $($gruplar.Count): $($g -join ', ')" -ForegroundColor Cyan
  if (-not (Yukle $only "Grup $gi")) { Dur "Grup $gi yuklenemedi (3 deneme). Site GONDERILMEDI. Birkac dakika sonra bu dosyayi tekrar calistir ya da ciktiyi Claude'a gonder." }
  if ($gi -lt $gruplar.Count) { Write-Host "Kota dolmasin diye 45 sn bekleniyor..." -ForegroundColor DarkGray; Start-Sleep -Seconds 45 }
}

Write-Host ""
Write-Host "===== git commit + push =====" -ForegroundColor Cyan
$ekle = @(
  'functions/index.js',
  'functions/onboardingData.js',
  'functions/profanity.js',
  'src/App.jsx',
  'src/components/BusinessHub/BusinessHub.jsx',
  'src/components/City/City.css',
  'src/components/City/CityBizList.jsx',
  'src/components/City/CityScreen.jsx',
  'src/components/City/VenueHud.jsx',
  'src/components/City/cityJobs.js',
  'src/components/CostumeShop/CostumeShop.css',
  'src/components/FactoryScreen/FactoryScreen.css',
  'src/components/FactoryScreen/FactoryScreen.jsx',
  'src/components/Gangs/GangPanel.jsx',
  'src/components/MekanlarScreen/VisitTab.jsx',
  'src/components/MekanlarScreen/MekanlarScreen.jsx',
  'src/components/Gangs/Gangs.css',
  'src/components/Gangs/GangsScreen.jsx',
  'src/components/Gangs/tabs/ListTab.jsx',
  'src/components/HouseScreen/HouseScreen.css',
  'src/components/HouseScreen/HouseScreen.jsx',
  'src/components/HouseScreen/HqPanels.jsx',
  'src/components/Politics/PoliticsHomeButton.jsx',
  'src/components/Venue3D/venueParts.jsx',
  'src/hooks/useOnboarding.js',
  'src/hooks/useOpenFactories.js',
  'src/lib/sixImage.js',
  'src/services/gameActions.js',
  'functions/scripts/onboarding.test.mjs',
  'functions/scripts/profanity.test.mjs',
  'V160-DEGISIKLIKLER.md',
  'deploy-v160-4.ps1'
) | Where-Object { Test-Path $_ }
git add -- $ekle
git commit -q -m "v160.4: belediyede garson (cayci) + tek secim/darbe dugmesi, amk kufur sayilmaz, karargah yol tarifi kervankente gitmiyor, Ziyaret'te Karargahlar; v160.3: mekan ici paneller, 5 sekmeli cete paneli, yeni 1. gorev, hizli Fabrikalar" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_0182eo1LKrqNSgRQ7mXcSDJS" -- $ekle
if ($LASTEXITCODE -ne 0) { Dur "git commit basarisiz. Fonksiyonlar YUKLENDI, site gonderilmedi. Ciktiyi Claude'a gonder." }
git push
if ($LASTEXITCODE -ne 0) { Dur "git push basarisiz. Fonksiyonlar YUKLENDI, site gonderilmedi. Ciktiyi Claude'a gonder." }

Write-Host ""
Write-Host "===== Cloudflare derlemesi bekleniyor (en fazla ~8 dk) =====" -ForegroundColor Cyan
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$sha = (git rev-parse HEAD).Trim()
$url = "https://api.github.com/repos/cetelerinsavasi-afk/neon-sehir/commits/$sha/check-runs"
$sonuc = $null
for ($i = 0; $i -lt 32; $i++) {
  Start-Sleep -Seconds 15
  try { $r = Invoke-RestMethod -Uri $url -Headers @{ 'User-Agent' = 'neon-sehir-deploy'; 'Accept' = 'application/vnd.github+json' } } catch { continue }
  $cf = $r.check_runs | Where-Object { $_.name -like 'Workers Builds*' } | Select-Object -First 1
  if (-not $cf) { Write-Host "  ...Cloudflare henuz baslamadi" -ForegroundColor DarkGray; continue }
  if ($cf.status -ne 'completed') { Write-Host "  ...Cloudflare derliyor" -ForegroundColor DarkGray; continue }
  $sonuc = $cf.conclusion
  break
}
Write-Host ""
if ($sonuc -eq 'success') {
  Write-Host "TAMAM: v160.4 yayinda. Oyunu yenile (bilgisayarda Ctrl+F5)." -ForegroundColor Green
} elseif ($sonuc) {
  Write-Host "Cloudflare derlemesi BASARISIZ ($sonuc). Cloudflare panelinde Workers > neon-sehir > Deployments'taki hata kaydini Claude'a gonder." -ForegroundColor Red
} else {
  Write-Host "Cloudflare 8 dk icinde derlemeyi baslatmadi. Cloudflare panelinde Workers > neon-sehir > Deployments'ta son commit icin 'Retry build' de." -ForegroundColor Yellow
}
