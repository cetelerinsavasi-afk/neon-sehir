# Neon Sehir v160 - Kostumler (100 hazir tip, zumrutle), kostum renk/ten duzeltmeleri, kas = sac rengi,
#   ince kadin kaslari, baska cetenin karargahina misafir girisi, mekandayken kapida gorunmeme,
#   yol tarifi yollar uzerinden (en kisa rota).
#   Dosyalar ZATEN proje klasorunde (v160-yukle.bat kopyaladi). Bu betik:
#   1) derleme + testler
#   2) 2 fonksiyon: cosmeticsAction (kostumler) + houseAction (karargaha misafir girisi)
#      (Firebase cogu zaman ancak 2. denemede "Deploy complete" diyor -> kendiliginden tekrar dener)
#   3) git commit + push -> Cloudflare siteyi yayinlar
#   Firestore / veritabani kurallari ve Android uygulamasi DEGISMEDI.

$ErrorActionPreference = 'Continue'
Set-Location -Path $PSScriptRoot
$env:GIT_ASK_YESNO = 'false'
function Dur($mesaj) { Write-Host ""; Write-Host $mesaj -ForegroundColor Red; exit 1 }

if (-not (Test-Path 'package.json') -or -not (Test-Path 'src\components\City\cityEngine.js')) { Dur "Bu dosya neon-sehir proje klasorunun ICINDE olmali." }
if (-not (Test-Path 'src\lib\avatarLooks.js') -or -not (Test-Path 'src\components\CostumeShop\CostumeShop.jsx')) { Dur "v160 dosyalari bulunamadi (src\lib\avatarLooks.js yok). HICBIR SEY YAPILMADI." }

Write-Host ""
Write-Host "===== arayuz derleme kontrolu =====" -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { Dur "Arayuz derlenemedi. HICBIR SEY YUKLENMEDI. Ciktiyi Claude'a gonder." }

$testler = @('tests/webview/webview.test.mjs', 'tests/city/jobs-resume.test.mjs', 'tests/city/kurye.test.mjs', 'functions/scripts/cosmetics.test.mjs', 'functions/scripts/v146-hq.test.mjs', 'functions/scripts/houses.test.mjs') | Where-Object { Test-Path $_ }
if ($testler.Count -gt 0) {
  Write-Host ""
  Write-Host "===== testler (WebView + sehir + kostum + karargah) =====" -ForegroundColor Cyan
  node --test @testler
  if ($LASTEXITCODE -ne 0) { Dur "Testler basarisiz. HICBIR SEY YUKLENMEDI. Ciktiyi Claude'a gonder." }
}

Write-Host ""
Write-Host "===== fonksiyonlar: cosmeticsAction + houseAction =====" -ForegroundColor Cyan
$only = 'functions:cosmeticsAction,functions:houseAction'
$tamam = $false
foreach ($bekle in @(0, 30, 90)) {
  if ($bekle -gt 0) {
    Write-Host "Fonksiyon yuklemesi tamamlanmadi, $bekle sn bekleyip tekrar deneniyor..." -ForegroundColor Yellow
    Start-Sleep -Seconds $bekle
  }
  firebase deploy --only $only
  if ($LASTEXITCODE -eq 0) { $tamam = $true; break }
}
if (-not $tamam) { Dur "Fonksiyonlar yuklenemedi (3 deneme). Site GONDERILMEDI. Birkac dakika sonra bu dosyayi tekrar calistir ya da ciktiyi Claude'a gonder." }

Write-Host ""
Write-Host "===== git commit + push =====" -ForegroundColor Cyan
$ekle = @(
  'src/lib/avatarLooks.js',
  'src/lib/avatarShapes.js',
  'src/components/CostumeShop/CostumeShop.jsx',
  'src/components/CostumeShop/CostumeShop.css',
  'src/components/HomeScreen/HomeScreen.jsx',
  'src/components/HomeScreen/HomeScreen.css',
  'src/components/AvatarBuilder/AvatarBuilder.jsx',
  'src/components/HouseScreen/HqPanels.jsx',
  'src/components/City/CityScreen.jsx',
  'src/components/City/cityEngine.js',
  'src/components/City/cityNet.js',
  'functions/cosmetics.js',
  'functions/cosmeticsData.js',
  'functions/houses.js',
  'functions/scripts/cosmetics.test.mjs',
  'functions/scripts/v146-hq.test.mjs',
  'V160-DEGISIKLIKLER.md',
  'deploy-v160.ps1'
) | Where-Object { Test-Path $_ }
git add -- $ekle
$gizli = git diff --cached --name-only -- $ekle | Select-String -Pattern '(keystore\.properties$|\.keystore$|\.jks$|local\.properties$|\.aab$|\.apk$|\.env$)'
if ($gizli) { git reset -q -- $ekle; Dur "Gizli/derleme dosyasi commit'e girecekti: $gizli -> commit YAPILMADI." }
# sadece v160 dosyalari commit'lenir (klasordeki baska degisikliklere dokunulmaz)
git commit -q -m "v160: Kostumler (Profil > Kostumler, 100 hazir tip, 10-200 zumrut, renk + ten degistirme), kostum renk yuvasi duzeltmeleri (periler, ajan, serif...), kas = sac rengi, ince kadin kaslari, baska cetenin karargahina misafir girisi, mekandayken kapida gorunmeme, yol tarifi yollar uzerinden" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_0182eo1LKrqNSgRQ7mXcSDJS" -- $ekle
if ($LASTEXITCODE -ne 0) { Dur "git commit basarisiz (degisiklik yok ya da git hatasi). Fonksiyonlar YUKLENDI, site gonderilmedi. Ciktiyi Claude'a gonder." }
git push
if ($LASTEXITCODE -ne 0) { Dur "git push basarisiz. Fonksiyonlar YUKLENDI, site gonderilmedi. Ciktiyi Claude'a gonder." }
Write-Host ""
Write-Host "TAMAM: v160 gonderildi (fonksiyonlar + site). Cloudflare birkac dakika icinde yayinlar." -ForegroundColor Green
