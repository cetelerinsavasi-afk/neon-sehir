# Neon Sehir v159 - oyuncu sikayetleri: sehir netligi (pikselleme), "Oyuncu" adi, sampiyonada oyundan atma
#   (Android geri / kenardan kaydirma), ic kamera fotografi, karargaha dogrudan giris, tek parmakta yakinlasma,
#   telefonda sola kaydir = Gazete, Flappy Kus bilgisayarlara, dukkanlara girilmez (kapida dugmeler),
#   sohbet hep acik, mesajlardaki uyari isareti kalkti.
#   Dosyalar ZATEN proje klasorunde. Bu betik:
#   1) derleme + testler
#   2) git commit + push -> Cloudflare siteyi yayinlar
#   Fonksiyonlar, Firestore / veritabani kurallari ve Android uygulamasi DEGISMEDI (firebase deploy yok).

$ErrorActionPreference = 'Continue'
Set-Location -Path $PSScriptRoot
$env:GIT_ASK_YESNO = 'false'
function Dur($mesaj) { Write-Host ""; Write-Host $mesaj -ForegroundColor Red; exit 1 }

if (-not (Test-Path 'package.json') -or -not (Test-Path 'src\components\City\cityEngine.js')) { Dur "Bu dosya neon-sehir proje klasorunun ICINDE olmali." }
if (-not (Test-Path 'src\lib\raceGuard.js')) { Dur "v159 dosyalari bulunamadi (src\lib\raceGuard.js yok). HICBIR SEY YAPILMADI." }

Write-Host ""
Write-Host "===== arayuz derleme kontrolu =====" -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { Dur "Arayuz derlenemedi. HICBIR SEY YUKLENMEDI. Ciktiyi Claude'a gonder." }

$testler = @('tests/webview/webview.test.mjs', 'tests/city/jobs-resume.test.mjs', 'tests/city/kurye.test.mjs') | Where-Object { Test-Path $_ }
if ($testler.Count -gt 0) {
  Write-Host ""
  Write-Host "===== WebView + sehir testleri =====" -ForegroundColor Cyan
  node --test @testler
  if ($LASTEXITCODE -ne 0) { Dur "Testler basarisiz. HICBIR SEY YUKLENMEDI. Ciktiyi Claude'a gonder." }
}

Write-Host ""
Write-Host "===== git commit + push =====" -ForegroundColor Cyan
$ekle = @(
  'src/App.jsx',
  'src/lib/raceGuard.js',
  'src/components/Arcade/Arcade.css',
  'src/components/Arcade/ArcadeHub.jsx',
  'src/components/City/City.css',
  'src/components/City/CityScreen.jsx',
  'src/components/City/cityEngine.js',
  'src/components/City/cityNet.js',
  'src/components/City/world/outerWorld.js',
  'src/components/GuideScreen/guideContent.js',
  'src/components/NearbyPlayers/NearbyPlayersButton.jsx',
  'src/components/Phone/PhoneScreen.css',
  'src/components/Phone/PhoneScreen.jsx',
  'src/components/RaceTrackScreen/TimeAttackRace.jsx',
  'src/components/HouseScreen/HouseScreen.jsx',
  'src/components/City/coast.js',
  'V159-DEGISIKLIKLER.md',
  'deploy-v159.ps1',
  'v159-yukle.bat'
) | Where-Object { Test-Path $_ }
git add -- $ekle
$gizli = git diff --cached --name-only | Select-String -Pattern '(keystore\.properties$|\.keystore$|\.jks$|local\.properties$|\.aab$|\.apk$|\.env$)'
if ($gizli) { git reset -q; Dur "Gizli/derleme dosyasi commit'e girecekti: $gizli -> commit YAPILMADI." }
git commit -q -m "v159.1: sehirdeki karargah icleri kaldirildi (her karargah kapisinda Iceri gir = gercek karargah, icerde kapida Sehre cik), dukkan kapilari yaklasinca acilmaz, beach club tabureleri + oturup kalkinca sikisma, sehirde Ceteler/Profil alttan acilan pencere | v159: sehir netligi (cozunurluk tabani + dinamik gorus mesafesi), Oyuncu adi duzeltmesi, yarista Android geri/kenardan kaydirma yarisi kapatmiyor + yarista sehir grafik bellegini birakir, ic kamera fotografi kokpitle, kendi karargahina dogrudan gercek karargah, hayalet parmak yakinlasmasi, telefonda sola kaydir = Gazete, Flappy Kus oyun salonunda, dukkanlara girilmez (kapida liste + soygun), sohbet hep acik, mesaj yanindaki uyari kalkti (sikayet Yakindakiler'den)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01YQymXP8ADf1HZUb3p4EzoC"
if ($LASTEXITCODE -ne 0) { Dur "git commit basarisiz (degisiklik yok ya da git hatasi). Ciktiyi Claude'a gonder." }
git push
if ($LASTEXITCODE -ne 0) { Dur "git push basarisiz. Ciktiyi Claude'a gonder." }
Write-Host ""
Write-Host "TAMAM: v159 gonderildi. Cloudflare birkac dakika icinde yayinlar." -ForegroundColor Green
