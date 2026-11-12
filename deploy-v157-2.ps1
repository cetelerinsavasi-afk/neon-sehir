# Neon Sehir v157.2 - sehir hafifletme (LOD, cizim cagrisi, bellek) + 2. el SMS vergi yazisi.
#   1) neon-sehir-v157.2.zip'i acar (once guvenlik kontrolu: dosyalar v156 / v157 / v157.1 / v157.2 halinde olmali)
#   2) derleme + sehir/WebView testleri + fonksiyon testleri
#   3) Fonksiyon: shopAction (SITEDEN ONCE)
#   4) git commit + push -> Cloudflare siteyi yayinlar
#   Android / veritabani kurallari / Firestore DEGISMEDI.

$ErrorActionPreference = 'Continue'
Set-Location -Path $PSScriptRoot
$env:GIT_ASK_YESNO = 'false'
function Dur($mesaj) { Write-Host ""; Write-Host $mesaj -ForegroundColor Red; exit 1 }

if (-not (Test-Path 'package.json') -or -not (Test-Path 'src\components\City\cityEngine.js')) { Dur "Bu dosya neon-sehir proje klasorunun ICINDE olmali." }
$zip = $null
foreach ($aday in @("$env:USERPROFILE\Downloads\neon-sehir-v157.2.zip", "$PSScriptRoot\neon-sehir-v157.2.zip")) { if (Test-Path $aday) { $zip = $aday; break } }
if (-not $zip) { Dur "neon-sehir-v157.2.zip bulunamadi." }
Write-Host "Zip: $zip" -ForegroundColor Cyan

$izinli = @{
  'database.rules.json' = @('76f8b0071b75dddb23cb4092c7d03b7ed21a03af', '79d72d0bdbd1d18c202ab660a40294785cf59e08')
  'functions/cityJobsData.js' = @('6e00bf8aee27895eb4871d795a4957d673446fbe', '179b68a35b734908bfae74082c319e76b44cf19c')
  'functions/cityPhoto.js' = @('448fca92c67ef189ebbf67b60b6a24478c53410e', 'fdcc5fecce0dfa03e4f5a3ea088b4875723c46fe')
  'functions/jobs.js' = @('db598883e06396bfeb1f665862d05f8208cc635e', 'f26e2e8545ea70fad6ed8d08c46cc11c792832b2')
  'functions/package.json' = @('fbf3affc03f3839b3727e0b2920962a59b1f4c58', '94aa69bb2e9b4fd828f07d358108c5d95d7a2fd4')
  'functions/scripts/v151-jobs.test.mjs' = @('6998cb6296c4f5c50d273cfff1de2fe64c86c13e', 'b41114218e4191f7ed71714b49021c3820c88eb3')
  'functions/scripts/v157-far-jobs.test.mjs' = @('8550708ea6866858f2a13d4424741aba366583ae')
  'functions/shop.js' = @('55d6c659ff31a7e1f3f42ba5b10efb4cf989ca60', 'c86193bffa2da2e8aa4a5013bed75de490165046')
  'functions/vehicleKinds.js' = @('4e4deaeba95aabc8c15e67ee384e21f5457b7597', '9266e2c737bb866bf6a5e7a007bffee54d6daa49')
  'preview/mekan-app.jsx' = @('1b03b7b50b33493a964c0bff8c4a7faf650f5732', '07f3cf6f3df00e978a44d8a597103409c03b9756')
  'preview/mocks/firebase-firestore.js' = @('6f5cb0c54f4fe39cde589f7049c8926b3f808b1f', '1683790ed79e5275060fe504544c93f702613843')
  'src/App.jsx' = @('c39154bfe2e6c5d656b24d4e95d924cf65e1fbf6', '6b2642867359c1b03031e2891eca777ebe4fb9bd')
  'src/components/BusinessHub/BusinessHub.jsx' = @('99ed397412a815847ea99346a8a4d601e18f7ebe', '711d0851410bbc5c2f04aaab7e79bae924e0f23b')
  'src/components/City/City.css' = @('aeefd85b0a5a02d540f651c88c2d41e5de809119', 'b623e96b484f0f88b553dd1a5c2982e83c1f9724')
  'src/components/City/CityBizList.jsx' = @('30218ca95eead28f039bfe08479ef6f8b74157c3')
  'src/components/City/CityPhoto.jsx' = @('72f6cce851eefccfd6486f61e255b5088be39471', '217ecabe6075297da0a38fe0ec42d2d8a183adaf')
  'src/components/City/CityScreen.jsx' = @('d7cc71ce723f683f47b02067e8bfe1d6e7393522', 'c6b31292b96ea6c2b4bfe7383f4baf6d36eb17fc', 'c4314b13c500614adad52512fbc5ad8ecdaf8a3d')
  'src/components/City/HeistVideo.jsx' = @('e22a3d387c4055b26c194f4cf441be5adfa4ac36', '60e9c7c1274b6f964b6bc2d125d7851cc0af45a7')
  'src/components/City/areas.js' = @('a14a060a384d7b17325f0fda88e1d824865056ab', '4d14971bd719debb2b55bcc87be8d994898a33e6', 'b3192361b059135d804dd77b7c14511677725eca')
  'src/components/City/buildings.js' = @('dfee7aafc91e550c55f65d2b78b1d3b05e7526e2', '96af25fe392b90173d4b2d1e967537e85cbda492')
  'src/components/City/cityEngine.js' = @('5b1f1be577716756c960342c3b5f8e80421ecadd', '93053bc46f3b3cabb7ed077685c91612cc356a30', '17629177bb70059a75129355847310897aaa3aaf', '0124bb98556bbc28009fd3151572bcddfa9e0dd7')
  'src/components/City/cityHeist.css' = @('b1ee34241b98a0930ef8f50b84383a08f6f7b93d', '8b085f75af2e85b3a5ce69c417c5bd005862e248')
  'src/components/City/cityHeist.js' = @('5bd675ee8c827e6e975a9b0b71b0ca31d61cde9a', '6b45f803d7803c8684de057ddab2874f76164df9')
  'src/components/City/cityJobs.js' = @('019ac34ff55ea100aa59b6d3fbfa12225102a87c', 'f8bb8583701f59d7e8cf8d1eb0ee29bd9e572309')
  'src/components/City/cityLayout.js' = @('349361ab4e2062374fd885e419cd9ff9b59dbf86', '6bd0e920b30510462bfd48a2ca6777241269fab2')
  'src/components/City/cityNet.js' = @('4fa95f88c1ded55bf67adc0fc876185528de90f8', '732c83f04b53539989441d604b631980d3e01e38')
  'src/components/City/cityPlan.js' = @('50ef39a57d181c67c6e03407f80eb5db9c856e74', 'a5db699dac47d3fb7a19f5f3345372a0fa55b074')
  'src/components/City/coast.js' = @('a597c70cda7997578f758664cfe22d6ea4b68c99')
  'src/components/City/coastShape.js' = @('3382348418cc77ba14518a4cf867ee09978e51f2')
  'src/components/City/jobBuildings.js' = @('1774837880c6edb3f7d4a364e46e59924f363fea', 'b6facb60fc0884e9aaf24c0e4781093649b23a19')
  'src/components/City/kit.js' = @('147a381e297dc56beee6ec9d77ba3864de62853a', '76d74351244a5f02cb56b63f8d9f961f082edce2', '4e53c38d56b003ff78685ab6fdb3d52bdecca59b', 'f7c910de0b20906f2b4ee1e373a940d4d753aaa7')
  'src/components/City/world/animals.js' = @('91b50fc4a45817dd497f34ac0b66eb4f221ce27e')
  'src/components/City/world/layouts.js' = @('21593c1ab26bfdcfd689a1e5eedb85eafebfb9a8')
  'src/components/City/world/map.js' = @('0ab9e9bcc6de0dc8b12f78c0b1af6be81ebed9c5')
  'src/components/City/world/newItems.js' = @('317c10c4996a88a90d4b3e8fa1fbffc7847c79dc')
  'src/components/City/world/northPark.js' = @('f837f7cac30ea8c3125255feb95a7703ffb957db')
  'src/components/City/world/otogar.js' = @('d274c726db7e435c23159d67d228396165c48db8')
  'src/components/City/world/outerWorld.js' = @('5010ac4a1c57e245654133a5547255e371870788', 'f2706fe6d709b9c65a1e9ba19917c3ce158a6fbb', 'a554fe6d89b468a8f285152993de45813407502f')
  'src/components/City/world/roadside.js' = @('8dab3a0593eea810647c4ed3a5d24b639e88e5a9')
  'src/components/City/world/roadsideGeo.js' = @('499e2e6b4dd754344038fce34cc8eb9ea98a15c5')
  'src/components/City/world/route.js' = @('d6499814c4c68b5a96a4ff4a7effb32bc2c77c09')
  'src/components/City/world/town.js' = @('19a08912a85575aec3f8ecf43093b829586c1738', 'd1bf84698930545782c0609c278c566a229abba3')
  'src/components/City/world/venues.js' = @('e0bc5a6ee4cec474b68b4ac0526ffd535bcea03e', 'a472aaebefb17a079b819a19de490da73eaf9443')
  'src/components/City/world/world.js' = @('fbaac88f8c07cc373d7fccd6b4e6afb4233fade7')
  'src/components/HouseScreen/houseCatalog.js' = @('342aca77b461825278cdb41536b605ab21c8aa85', '9873a5f6c8c5e4947959430d44c1f94f999ee798', '5e08cf50103c970ddad815f74fd4a2112a612a1c')
  'src/components/HouseScreen/houseCatalogPets.js' = @('ce940338b85504070a9cd6b420c67fe7ae9143cf', 'c686e0eed8d006dd584e48f98906adc562f14638')
  'src/components/HouseScreen/houseCatalogV135.js' = @('355e14b76acbfc2614497bd816193373bef2b139', '196e84644ff5421d42e11bec417557e7fd617d9c')
  'src/components/HouseScreen/houseCatalogV145.js' = @('e9b7d76d111e0d06f6036d38575ddf0cd388a892', 'c16d63be3bc8bd3bdf5c095197258a4e4f68e1aa')
  'src/components/HouseScreen/houseCatalogV146.js' = @('4bcc6b359ac5215e653f3b246050e2781ebc1f4e', '79f093103edfadd3748c5648661859a8fc60a156')
  'src/components/HouseScreen/houseCatalogV92.js' = @('5c2e802d3b0250d8a10cb989e5148350cc4925d7', '84e129f69a8f954b928977a590717a1eed8ee7fe')
  'src/components/HouseScreen/houseTextures.js' = @('bb4b89dcccb35006ccd0d9afc0632959ce61e6d4', '2bd5042c1f0dc849f8a53a5cae9cc201fc01717b')
  'src/components/MekanlarScreen/MekanlarScreen.css' = @('4dc9da7f7a28eb3bab253ccf6b36b5634185c867', '0d430462e50a221293c3f9584d07241ec264fb62')
  'src/components/MekanlarScreen/SoygunTab.jsx' = @('992eb423ab43ac0ad2b9b8742ee77dbfb83118f8', 'ca82cb981c8c201c246ea79d9156887824709ddd')
  'src/components/MekanlarScreen/VisitTab.jsx' = @('8256b3210f3e4ab963cd4a93079cf781c4caa021', '35d04941cfbd2cebfce3e99b088b54265a5b5320')
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

$tmp = Join-Path $env:TEMP 'neon-v157-2-zip'
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

Write-Host ""
Write-Host "===== Fonksiyon: shopAction =====" -ForegroundColor Cyan
firebase deploy --only functions:shopAction
if ($LASTEXITCODE -ne 0) {
  Write-Host "Hata (kota olabilir). 120 sn bekleyip bir kez daha deneniyor..." -ForegroundColor Yellow
  Start-Sleep -Seconds 120
  firebase deploy --only functions:shopAction
  if ($LASTEXITCODE -ne 0) { Dur "shopAction yuklenemedi. git push YAPILMADI. Biraz sonra tekrar calistir; olmazsa ciktiyi Claude'a gonder." }
}

Write-Host ""
Write-Host "===== git commit + push =====" -ForegroundColor Cyan
$ekle = @('database.rules.json', 'functions/cityJobsData.js', 'functions/cityPhoto.js', 'functions/jobs.js', 'functions/package.json', 'functions/scripts/v151-jobs.test.mjs', 'functions/scripts/v157-far-jobs.test.mjs', 'functions/shop.js', 'functions/vehicleKinds.js', 'preview/mekan-app.jsx', 'preview/mocks/firebase-firestore.js', 'src/App.jsx', 'src/components/BusinessHub/BusinessHub.jsx', 'src/components/City/City.css', 'src/components/City/CityBizList.jsx', 'src/components/City/CityPhoto.jsx', 'src/components/City/CityScreen.jsx', 'src/components/City/HeistVideo.jsx', 'src/components/City/areas.js', 'src/components/City/buildings.js', 'src/components/City/cityEngine.js', 'src/components/City/cityHeist.css', 'src/components/City/cityHeist.js', 'src/components/City/cityJobs.js', 'src/components/City/cityLayout.js', 'src/components/City/cityNet.js', 'src/components/City/cityPlan.js', 'src/components/City/coast.js', 'src/components/City/coastShape.js', 'src/components/City/jobBuildings.js', 'src/components/City/kit.js', 'src/components/City/world/animals.js', 'src/components/City/world/layouts.js', 'src/components/City/world/map.js', 'src/components/City/world/newItems.js', 'src/components/City/world/northPark.js', 'src/components/City/world/otogar.js', 'src/components/City/world/outerWorld.js', 'src/components/City/world/roadside.js', 'src/components/City/world/roadsideGeo.js', 'src/components/City/world/route.js', 'src/components/City/world/town.js', 'src/components/City/world/venues.js', 'src/components/City/world/world.js', 'src/components/HouseScreen/houseCatalog.js', 'src/components/HouseScreen/houseCatalogPets.js', 'src/components/HouseScreen/houseCatalogV135.js', 'src/components/HouseScreen/houseCatalogV145.js', 'src/components/HouseScreen/houseCatalogV146.js', 'src/components/HouseScreen/houseCatalogV92.js', 'src/components/HouseScreen/houseTextures.js', 'src/components/MekanlarScreen/MekanlarScreen.css', 'src/components/MekanlarScreen/SoygunTab.jsx', 'src/components/MekanlarScreen/VisitTab.jsx', 'V157-2-DEGISIKLIKLER.md', 'deploy-v157-2.ps1') | Where-Object { Test-Path $_ }
git add -- $ekle
$gizli = git diff --cached --name-only | Select-String -Pattern '(keystore\.properties$|\.keystore$|\.jks$|local\.properties$|\.aab$|\.apk$|\.env$)'
if ($gizli) { git reset -q; Dur "Gizli/derleme dosyasi commit'e girecekti: $gizli -> commit YAPILMADI." }
git commit -q -m "v157.2: sehir hafifletme - mesafeye gore detay (LOD), tembel mekan icleri, malzeme birlestirme, dusuk bellek; 2. el SMS vergi yazisi" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_0182eo1K7a8WiqJvJnxUChNu"
if ($LASTEXITCODE -ne 0) { Dur "git commit basarisiz (degisiklik yok ya da git hatasi). Ciktiyi Claude'a gonder." }
git push
if ($LASTEXITCODE -ne 0) { Dur "git push basarisiz. Ciktiyi Claude'a gonder." }
Write-Host ""
Write-Host "TAMAM: v157.2 gonderildi. Cloudflare birkac dakika icinde yayinlar." -ForegroundColor Green
