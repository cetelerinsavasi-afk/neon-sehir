# Neon Sehir v147.4 - gezilebilir sehir (+ hiz, akici oyuncu/araba, cokme duzeltmeleri) + fotograf + Firestore maliyet azaltma + oylama duyurusu + teskilat polis tipi
#   1) Realtime Database kurallari (sehir: konum, araba, sohbet, koltuk)
#   2) Sunucu fonksiyonlari (cityAction, cityMuteMirror, createSixtagramPost, houseAction, gangAction - 3 deneme)
#   3) Arayuz derlemesi (hata varsa push YAPILMAZ)
#   4) Hepsi basariliysa git commit + push (arayuz)
#   Cift tikla: deploy-v147-4.bat   - soru sormaz.

$ErrorActionPreference = 'Continue'
Set-Location -Path $PSScriptRoot
$env:GIT_ASK_YESNO = 'false'

$dk = (Get-Date).Hour * 60 + (Get-Date).Minute
if ($dk -ge 1380 -or $dk -lt 60 -or ($dk -ge 1065 -and $dk -lt 1155)) {
  Write-Host "Su an yogun saat (23:00-01:00 / 17:45-19:15). Bu saatlerin disinda tekrar calistir." -ForegroundColor Yellow
  exit 1
}

function Yukle($ad, $hedef) {
  for ($deneme = 1; $deneme -le 3; $deneme++) {
    Write-Host ""
    Write-Host "===== $ad (deneme $deneme / 3) =====" -ForegroundColor Cyan
    firebase deploy --only $hedef --non-interactive
    if ($LASTEXITCODE -eq 0) { return $true }
    if ($deneme -lt 3) { Write-Host "Yuklenemedi, 90 sn sonra tekrar..." -ForegroundColor Yellow; Start-Sleep -Seconds 90 }
  }
  return $false
}

$gruplar = @(
  @('veritabani kurallari (sehir)', 'database'),
  @('sehir + fotograf + polis tipi', 'functions:cityAction,functions:cityMuteMirror,functions:createSixtagramPost,functions:houseAction'),
  @('cete / teskilat (oylama duyurusu + Pazar savasi)', 'functions:gangAction,functions:gangClock')
)
foreach ($g in $gruplar) {
  if (-not (Yukle $g[0] $g[1])) {
    Write-Host "$($g[0]) yuklenemedi. git push YAPILMADI. Ciktiyi Claude'a gonder." -ForegroundColor Red
    exit 1
  }
  Start-Sleep -Seconds 20
}

Write-Host ""
Write-Host "===== arayuz derleme kontrolu =====" -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) {
  Write-Host "Arayuz derlenemedi. Sunucu guncel ama git push YAPILMADI. Ciktiyi Claude'a gonder." -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "===== git commit + push (arayuz) =====" -ForegroundColor Cyan
foreach ($f in @('deploy-v146-4.ps1','deploy-v146-4.bat','deploy-v147.ps1','deploy-v147.bat','deploy-v147-2.ps1','deploy-v147-2.bat','deploy-v147-3.ps1','deploy-v147-3.bat')) {
  if (Test-Path $f) { git rm -q -f -- $f 2>$null; if (Test-Path $f) { Remove-Item -Force $f } }
}
git add -- functions src preview database.rules.json deploy-v147-4.ps1 deploy-v147-4.bat
git commit -q -m "v147.4: gezilebilir sehir (yurume, araba, yolculuk, yakin sohbet - RTDB) + otomatik grafik ayari, gorus mesafesi, dusuk poligon, ortak grafik baglami, akici oyuncu/araba (tahmin), fotograf/hikaye, mekandan sehre cikis ve geri donus, oylamayi baslatan sohbette, teskilatta polis tipi, Firestore maliyet azaltma, Sixtagram fotograf onbellegi, haritaya surukle-birak, dis sokak halkasi, park gol duzeni + batma, saate gore gokyuzu (gunduz/gun batimi/gece/gun dogumu)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_0182eo1LEeosPZHtzM4dmgsQ"
git push
if ($LASTEXITCODE -ne 0) {
  Write-Host "git push basarisiz. Sunucu guncel ama arayuz eski. Ciktiyi Claude'a gonder." -ForegroundColor Red
  exit 1
}
Write-Host ""
Write-Host "TAMAM: v147.4 canlida." -ForegroundColor Green
