# Neon Sehir v158.1 - karargah zemini titremesi, kapi kapali (iceri/disari gorunmez), iceride kapinin otesine dokunma + v158 tamami: yildizli gece tavani, karargah (zemin + haritadan bagimsiz), ATM'ler, hatirlatmalarda Git, HGS, uzak tir isi ters yon, performans,
#   tir firma adi silinebilir, telefon dugmesinde okunmamis sayisi.
#   1) neon-sehir-v158.1.zip'i acar (once guvenlik kontrolu: dosyalar bilinen surumlerden birinde olmali)
#   2) derleme + sehir/WebView testleri + fonksiyon testleri
#   3) Fonksiyon: cityAction (uzak tir isi ters yon) - SITEDEN ONCE
#   4) git commit + push -> Cloudflare siteyi yayinlar
#   Firestore / veritabani kurallari ve Android uygulamasi DEGISMEDI.

$ErrorActionPreference = 'Continue'
Set-Location -Path $PSScriptRoot
$env:GIT_ASK_YESNO = 'false'
function Dur($mesaj) { Write-Host ""; Write-Host $mesaj -ForegroundColor Red; exit 1 }

if (-not (Test-Path 'package.json') -or -not (Test-Path 'src\components\City\cityEngine.js')) { Dur "Bu dosya neon-sehir proje klasorunun ICINDE olmali." }
$zip = $null
foreach ($aday in @("$env:USERPROFILE\Downloads\neon-sehir-v158.1.zip", "$PSScriptRoot\neon-sehir-v158.1.zip")) { if (Test-Path $aday) { $zip = $aday; break } }
if (-not $zip) { Dur "neon-sehir-v158.1.zip bulunamadi." }
Write-Host "Zip: $zip" -ForegroundColor Cyan

$izinli = @{
  'functions/jobs.js' = @('db598883e06396bfeb1f665862d05f8208cc635e', 'f26e2e8545ea70fad6ed8d08c46cc11c792832b2', '3daf79227c22cfcddae9efd472b836689330348d')
  'functions/package.json' = @('fbf3affc03f3839b3727e0b2920962a59b1f4c58', '94aa69bb2e9b4fd828f07d358108c5d95d7a2fd4', '9eac27d71fe7c95fddd1ae99d984d1d906f64d66')
  'functions/scripts/v158-far-back.test.mjs' = @('fa97d831d5dd0a5a5adc38cea91c696543907d7f')
  'src/App.jsx' = @('c39154bfe2e6c5d656b24d4e95d924cf65e1fbf6', '6b2642867359c1b03031e2891eca777ebe4fb9bd', '5b14cb8c52f670dd9eb3520e8bd9a291517d5c17', 'a6a4edd5c088386fb05c46e23d32c07d889427e9', '2b70b6a175c7ea2ad3a16bc892ff4dfdd790d98a', '252664d82a01fcfa1d284dfe39df93ff19dde9b9', '94e71785618fad69fe5e6385ac9a68d7d3437ee7', 'ad8d19590c37b86348fe8947ca154aa8a6238e13', '89df80d64db0ae8ca15b8eedc69ecfdabbd7db41')
  'src/components/City/City.css' = @('aeefd85b0a5a02d540f651c88c2d41e5de809119', 'b623e96b484f0f88b553dd1a5c2982e83c1f9724', '8dbd8ae92a274073d2a58e9ae1e2218adfaebf48', 'c17e22e5639480e806c3774ab6de6a68b2fae59c', '5ddc15e6c9045a2bb9b8a67301145a5d19b2b6c3', 'c310c8b7f94cbfac3570cd35b082b6040b2ee365', '38acb760675538ae0c87e8240bafd557160e0761', '4e8859c4736eed7c0828e9e3fecf7769b4c3452f')
  'src/components/City/CityScreen.jsx' = @('d7cc71ce723f683f47b02067e8bfe1d6e7393522', 'c6b31292b96ea6c2b4bfe7383f4baf6d36eb17fc', 'c4314b13c500614adad52512fbc5ad8ecdaf8a3d', '0c9705a1e545384765a2d7e8408fcd7b5805ac8a', '74e833681f7dfe9d26d3451c2721fc5c47b7ee75', 'c8d7de5c2b4249dddb20595ac22f29c2303e3320', 'f0874de952df569974c20e8eb1d8e1800f8c74d4', '3feb7fc1360e1c68054abb76b9bb99272a0c45ae', '158dd2268ca1c60151791b7ae70fcd3562846db2', '227aaf1fc01dae808914c3e69d5c5f0d6cb11714')
  'src/components/City/cityEngine.js' = @('5b1f1be577716756c960342c3b5f8e80421ecadd', '93053bc46f3b3cabb7ed077685c91612cc356a30', '17629177bb70059a75129355847310897aaa3aaf', '0124bb98556bbc28009fd3151572bcddfa9e0dd7', 'f2deadbc048fb9483663b61d1af00b7f568f35fb', '74b1d4ad44bd56af6ce24e603de1568fc740fe3a', '5aeba00ea0c7dcf9f80ff9e6a4eaf102033eadbf', '39bfc7ffed4d3dccf419612b3ed37ab2bb55421a', '8dc4aaa72235b6ffe088fd7f8c545655d57156bc', '505c0a12568f0b7f4009838358f287cf8777322f', '42f57d88f74dcc650f276651a1a84f3b3f50b010', '7c8bfaa69f1099762f3a702c384bd49ce438caa2', 'ce35332cc18f94e94e25fbed77cff988723c2d63', '1ce5871d59411955f1ab1b9319194ef0cc2e29bc')
  'src/components/City/cityJobs.js' = @('019ac34ff55ea100aa59b6d3fbfa12225102a87c', 'f8bb8583701f59d7e8cf8d1eb0ee29bd9e572309', 'ff7ed53000dc513687ac635522157c55fcd16903')
  'src/components/City/kit.js' = @('147a381e297dc56beee6ec9d77ba3864de62853a', '76d74351244a5f02cb56b63f8d9f961f082edce2', '4e53c38d56b003ff78685ab6fdb3d52bdecca59b', 'f7c910de0b20906f2b4ee1e373a940d4d753aaa7', 'e84bc103e2dd90cad7cdb5990a28cede56166ce1', '857c815b52dc283cff85e7676274d13379257860')
  'src/components/City/stadium.js' = @('205e46da9367442a39a955f9781057f24d68792e', '2314f04588aea9ce754b37e68d93ca437bbfaebf')
  'src/components/City/world/outerWorld.js' = @('5010ac4a1c57e245654133a5547255e371870788', 'f2706fe6d709b9c65a1e9ba19917c3ce158a6fbb', 'a554fe6d89b468a8f285152993de45813407502f', '5dcfa518b37c47f80724b66a9baf66261e0e2ea3', '42f8fa55f9de76f4ed5a3a3d9e28ba055cffddd6', '271b95a0bc0afccebb39ab4ed4c1505824dc63bb', '94e40d4c45237a8ed08a9288d9e6b9feb20ed8fc', '0f37360edb22d5f0f861ce42f70512090962a6d0')
  'src/components/City/world/venues.js' = @('e0bc5a6ee4cec474b68b4ac0526ffd535bcea03e', 'a472aaebefb17a079b819a19de490da73eaf9443', 'c4035bfbd993401dadb90000748543834ee68cf1', '796ad72b51ca2ec97fe61c1d98bcbd9a41705ca4', '63549acf55f4825d23844cfa05d05112cd3721c5', 'ad4364cf25ff9e76f0bbae071dfe4f82720524f6', 'a6abdc1f28fb581d4cc8548a00c981c295e2b570', '8029b34bc1e8855fc82c1c8f39577c0e77c3224d', '230601bb1a1ae9456d058a7df74b3fa698db2b6b')
  'src/components/HouseScreen/houseCatalog.js' = @('342aca77b461825278cdb41536b605ab21c8aa85', '9873a5f6c8c5e4947959430d44c1f94f999ee798', '5e08cf50103c970ddad815f74fd4a2112a612a1c', '93c6c29d9ed8d862829774592550af13e63eaf7d')
  'src/components/HouseScreen/houseTextures.js' = @('bb4b89dcccb35006ccd0d9afc0632959ce61e6d4', '2bd5042c1f0dc849f8a53a5cae9cc201fc01717b', '4b12edcab6d0688ff19a7e00e3f30d2fba763abc')
  'src/components/OnboardingPanel/OnboardingPanel.css' = @('9f8fae26d911b62797ed5bc0e179c85e6f90924e', 'f16d2d31f14f562085da5a7b376544947ec24d5c', 'b10555625a838a708d1a1e9b57fb3685259d59f3')
  'src/components/OnboardingPanel/OnboardingPanel.jsx' = @('7c77a1c7edfd862b66faad4a024503adee82f27b', 'f1aef1052c4321ee9fdeb6133313ce12aa3273eb', '505cb5889e0b09fed5a59d0b970d36688b723c6b', '6f0e58f8870d025dbf68def064ddc632c5caf217')
  'src/components/Workshop/ModifiyeStudio.jsx' = @('f416a95b181efbcb0d4d23b95b9d39acafb7b4de', '46ccd79f33cfeebc0620750abd56eb5d66b63a3d')
  'src/hooks/useOnboarding.js' = @('ab664f9b45105a1c38d04d0f493c59f325aaa137', '9db54f2712ed026d36a20a80c2afc8dd32aa6262')
}
$degisen = @()
foreach ($f in $izinli.Keys) {
  if (-not (Test-Path $f)) { continue }
  $h = (git hash-object -- $f).Trim()
  if ($izinli[$f] -notcontains $h) { $degisen += $f }
}
if ($degisen.Count -gt 0) {
  Write-Host "Su dosyalar beklenmedik sekilde degismis:" -ForegroundColor Yellow
  $degisen | Sort-Object | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
  Dur "Ustune yazarsam bu degisiklikler kaybolur. HICBIR SEY YAPILMADI. Bu listeyi Claude'a gonder."
}

$tmp = Join-Path $env:TEMP 'neon-v158-1-zip'
Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
try { Expand-Archive -Path $zip -DestinationPath $tmp -Force -ErrorAction Stop } catch { Dur "Zip acilamadi: $($_.Exception.Message)" }
Write-Host ""
Write-Host "===== dosyalar yerlestiriliyor =====" -ForegroundColor Cyan
try { Copy-Item -Path (Join-Path $tmp '*') -Destination $PSScriptRoot -Recurse -Force -ErrorAction Stop } catch { Dur "Dosyalar kopyalanamadi: $($_.Exception.Message)" }
Write-Host "Tamam." -ForegroundColor Green

Write-Host ""
Write-Host "===== arayuz derleme kontrolu =====" -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { Dur "Arayuz derlenemedi. HICBIR SEY YUKLENMEDI. Ciktiyi Claude'a gonder." }
Write-Host ""
Write-Host "===== WebView + sehir testleri =====" -ForegroundColor Cyan
node --test tests/webview/webview.test.mjs tests/city/jobs-resume.test.mjs tests/city/kurye.test.mjs
if ($LASTEXITCODE -ne 0) { Dur "Testler basarisiz. HICBIR SEY YUKLENMEDI. Ciktiyi Claude'a gonder." }
Write-Host ""
Write-Host "===== fonksiyon testleri =====" -ForegroundColor Cyan
npm --prefix functions test
if ($LASTEXITCODE -ne 0) { Dur "Fonksiyon testleri basarisiz. HICBIR SEY YUKLENMEDI. Ciktiyi Claude'a gonder." }

foreach ($fn in @('cityAction')) {
  Write-Host ""
  Write-Host "===== Fonksiyon: $fn =====" -ForegroundColor Cyan
  firebase deploy --only "functions:$fn"
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Hata (kota olabilir). 120 sn bekleyip bir kez daha deneniyor..." -ForegroundColor Yellow
    Start-Sleep -Seconds 120
    firebase deploy --only "functions:$fn"
    if ($LASTEXITCODE -ne 0) { Dur "$fn yuklenemedi. git push YAPILMADI. Biraz sonra tekrar calistir; olmazsa ciktiyi Claude'a gonder." }
  }
}

Write-Host ""
Write-Host "===== git commit + push =====" -ForegroundColor Cyan
$ekle = @('functions/jobs.js', 'functions/package.json', 'functions/scripts/v158-far-back.test.mjs', 'src/App.jsx', 'src/components/City/City.css', 'src/components/City/CityScreen.jsx', 'src/components/City/cityEngine.js', 'src/components/City/cityJobs.js', 'src/components/City/kit.js', 'src/components/City/stadium.js', 'src/components/City/world/outerWorld.js', 'src/components/City/world/venues.js', 'src/components/HouseScreen/houseCatalog.js', 'src/components/HouseScreen/houseTextures.js', 'src/components/OnboardingPanel/OnboardingPanel.css', 'src/components/OnboardingPanel/OnboardingPanel.jsx', 'src/components/Workshop/ModifiyeStudio.jsx', 'src/hooks/useOnboarding.js', 'V158-DEGISIKLIKLER.md', 'deploy-v158-1.ps1') | Where-Object { Test-Path $_ }
git add -- $ekle
$gizli = git diff --cached --name-only | Select-String -Pattern '(keystore\.properties$|\.keystore$|\.jks$|local\.properties$|\.aab$|\.apk$|\.env$)'
if ($gizli) { git reset -q; Dur "Gizli/derleme dosyasi commit'e girecekti: $gizli -> commit YAPILMADI." }
git commit -q -m "v158.1: karargah zemini titremesi (ic tamamen yenilenir), kapi hep kapali + iceriden kapali kapi, karargah ici disaridan gorunmez, iceride dokunus oda icinde / disarida karargaha dokununca kapiya + v158: yildizli gece tavani + tek dolunay, karargah zemini, karargah haritadan bagimsiz (iceri gir / sehre cik), tum ATM'ler, camii panel boslugu, hatirlatmalarda Git, HGS gorunmez duvar, uzak tir isi ters yon, performans (dinamik cozunurluk, LOD, ic mekan yalitimi), tir firma adi tamamen silinebilir, telefon dugmesinde okunmamis sayisi" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_0182eo1HFr9nXscoN9dfsuF4"
if ($LASTEXITCODE -ne 0) { Dur "git commit basarisiz (degisiklik yok ya da git hatasi). Ciktiyi Claude'a gonder." }
git push
if ($LASTEXITCODE -ne 0) { Dur "git push basarisiz. Ciktiyi Claude'a gonder." }
Write-Host ""
Write-Host "TAMAM: v158.1 gonderildi. Cloudflare birkac dakika icinde yayinlar." -ForegroundColor Green
