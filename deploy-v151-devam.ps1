# Neon Sehir v151 - DEVAM: ilk 4 fonksiyon grubu yuklendi; kalan fonksiyonlar + commit + push.
#   (5. grup "No function matches the filter" ile durmustu: zamanlanmis isler ayri fonksiyon
#    degil, cronTick icinde calisiyor.) Saat kontrolu YOK.
$ErrorActionPreference = 'Continue'
Set-Location -Path $PSScriptRoot
$env:GIT_ASK_YESNO = 'false'

function Dur($mesaj) {
  Write-Host ""
  Write-Host $mesaj -ForegroundColor Red
  exit 1
}

if (-not (Test-Path 'functions\jobs.js') -or -not (Test-Path 'src\components\City\cityJobs.js')) {
  Dur "v151 dosyalari klasorde yok. Once deploy-v151-simdi.bat calismis olmali."
}

Write-Host ""
Write-Host "===== Kalan fonksiyonlar: toggleSixtagramLike, captureCameraSnapshot, cronTick, raiseSponsorshipFee, respondSponsorshipFeeRaiseRequest, resolveStuckRewardsNow =====" -ForegroundColor Cyan
$only = 'functions:toggleSixtagramLike,functions:captureCameraSnapshot,functions:cronTick,functions:raiseSponsorshipFee,functions:respondSponsorshipFeeRaiseRequest,functions:resolveStuckRewardsNow'
firebase deploy --only $only
if ($LASTEXITCODE -ne 0) {
  Write-Host "Hata verdi (kota olabilir). 120 sn bekleyip bir kez daha deneniyor..." -ForegroundColor Yellow
  Start-Sleep -Seconds 120
  firebase deploy --only $only
  if ($LASTEXITCODE -ne 0) { Dur "Kalan fonksiyonlar yuklenemedi. git push YAPILMADI. Ciktiyi Claude'a gonder; bu dosyayi tekrar calistirabilirsin." }
}

# ---------------------------------------------------------------- 7) commit + push
Write-Host ""
Write-Host "===== git commit + push =====" -ForegroundColor Cyan
git add -- src functions/index.js functions/itemRules.js functions/shop.js functions/vehicleMods.js functions/catalogData.js functions/vehicleKinds.js functions/cityJobsData.js functions/jobs.js functions/package.json functions/scripts/shop.test.mjs functions/scripts/v151-jobs.test.mjs preview/mocks/firebase-auth.js preview/mocks/backend.js database.rules.json V149-DEGISIKLIKLER.md V150-DEGISIKLIKLER.md V151-DEGISIKLIKLER.md deploy-v151.ps1 deploy-v151.bat deploy-v151-simdi.bat deploy-v151-devam.ps1 deploy-v151-devam.bat
$gizli = git diff --cached --name-only | Select-String -Pattern '(keystore\.properties$|\.keystore$|\.jks$|local\.properties$|\.aab$|\.apk$|\.env$)'
if ($gizli) {
  git reset -q
  Dur "Gizli/derleme dosyasi commit'e girecekti: $gizli  -> commit YAPILMADI. Claude'a gonder."
}
git commit -q -m "v151: ticari araclar (tir, otobus, taksi, polis, ambulans) + 4 motor, galeri Araba/Ticari/Motor sekmeleri, meslekler (Ise basla; haklar oyuncu bazli, odeme sunucuda), 2 lojistik deposu + benzinlik + hastane + 10 otobus duragi, arac ici kamera, stadyum (ense, dogma yeri), sehir sohbet gecmisi, oyunun modifiyecisi geliri dunun en az kazananina; v149 + v150 dahil" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_0182eo1GukBVJkhsdTAoHWBc"
if ($LASTEXITCODE -ne 0) { Dur "git commit basarisiz (degisiklik yok ya da git hatasi). Ciktiyi Claude'a gonder." }
git push
if ($LASTEXITCODE -ne 0) { Dur "git push basarisiz. Commit bilgisayarinda duruyor ama site eski. Ciktiyi Claude'a gonder." }

Write-Host ""
Write-Host "TAMAM: v151 gonderildi. Cloudflare birkac dakika icinde yayinlar." -ForegroundColor Green
Write-Host "Kontrol: galeride Ticari/Motor sekmeleri, ticari araca binince Ise basla, duraklar/depolar, arac ici kamera, stadyum." -ForegroundColor Cyan
