# Neon Sehir v153 - fabrika ilanlari 3 gunde kapanir, seyyar saticiya "Bagis yap", sehirde harac animasyonu,
#   yeni arac ici (kokpit) gorunumu, modifiye/galeri aciklamalari kaldirildi, Sixtagram'da stadyum sponsorlari,
#   is guzergahi yolda ve haritada gorunur, otobus duraklari sehrin icinden ve disindan gecer.
#   v149-v152'yi de ICERIR (yuklemediysen hepsi birlikte gider).
#   1) neon-sehir-v153.zip dosyasini proje klasorune acar
#   2) Arayuz derlemesi + WebView testleri + fonksiyon testleri (hata varsa hicbir sey YUKLENMEZ)
#   3) Realtime Database kurallari (degismedi, yine de yuklenir)
#   4) Firebase fonksiyonlari (10 fonksiyon, 2 grup) - SITEDEN ONCE
#   5) git commit + push  -> Cloudflare siteyi yayinlar
#   Firestore kurallari DEGISMEDI.
#   Cift tikla: deploy-v153.bat (yogun saatte: deploy-v153-simdi.bat)   - soru sormaz.

$ErrorActionPreference = 'Continue'
Set-Location -Path $PSScriptRoot
$env:GIT_ASK_YESNO = 'false'

function Dur($mesaj) {
  Write-Host ""
  Write-Host $mesaj -ForegroundColor Red
  exit 1
}

$dk = (Get-Date).Hour * 60 + (Get-Date).Minute
# deploy-v153-simdi.bat ile calistirilirsa (NEON_SIMDI=1) yogun saat kontrolu atlanir
if ($env:NEON_SIMDI -ne '1' -and ($dk -ge 1380 -or $dk -lt 60 -or ($dk -ge 1065 -and $dk -lt 1155))) {
  Write-Host "Su an yogun saat (23:00-01:00 / 17:45-19:15). Bu saatlerin disinda tekrar calistir ya da hemen yuklemek icin deploy-v153-simdi.bat kullan." -ForegroundColor Yellow
  exit 1
}

if (-not (Test-Path 'package.json') -or -not (Test-Path 'src\components\City\cityEngine.js')) {
  Dur "Bu dosyalar neon-sehir proje klasorunun ICINDE olmali (package.json bulunamadi)."
}

# ---------------------------------------------------------------- 1) zip'i bul
$zip = $null
foreach ($aday in @("$PSScriptRoot\neon-sehir-v153.zip", "$env:USERPROFILE\Downloads\neon-sehir-v153.zip")) {
  if (Test-Path $aday) { $zip = $aday; break }
}
if (-not $zip) { Dur "neon-sehir-v153.zip bulunamadi. Zip'i bu klasore (ya da Indirilenler'e) koy ve tekrar calistir." }
Write-Host "Zip: $zip" -ForegroundColor Cyan

# ---------------------------------------------------------------- 2) guvenlik kontrolu
# Her dosya ya v148 (dee8518), ya v149-v152, ya da zaten v153 halinde olmali. Baska bir
# degisiklik varsa ustune yazmak onu siler -> dur.
$izinli = @{
  'V149-DEGISIKLIKLER.md' = @('8bd346a73448c578b3730984479719600ec8f233')
  'V150-DEGISIKLIKLER.md' = @('b418783a175bd3b01a8a83f928fd96612616559e')
  'V151-DEGISIKLIKLER.md' = @('72664b7ee132ddafec1811a8777449a549c22173')
  'database.rules.json' = @('820674232d9e30e48851dca3da2f73cfb3af05d5', '32ef1d28ca7441917c7b6e7e07f2601907de98ca', '6d8414621973dc1a767dd4d3a5c5834aae6eb210', 'fc665e6a1e1b331b04abfb317d3142a2a79a2029')
  'functions/catalogData.js' = @('dbd3ef7df510926a353bf7fdcc0606bd5ff70dc5', '63a6c4350550f11ba82bff4c69c85090561575a2')
  'functions/cityJobsData.js' = @('a1d840d15d54d88bb87c12be01fcd8339c0b6974', 'ea2fa6b8b0f6c07dde5705ce880442ec1911cb6d', 'd4c987621dbe47358be5042604af6a9462bb1d5a')
  'functions/index.js' = @('9ba9f7d2326ccc70b1a3d5ad10d2efb2150d1a2d', 'fea2900bacb3d99b02d69dc6cb60acf2b0bdd2b8', '42ae0b3360a3c5474e96edc52c2a9823588bbf5f', '93ac5d59b43570478578ede5808db7c6c3a58386')
  'functions/itemRules.js' = @('8566443a2447ac11d0aa7d68642472aebeaf6947', 'e3dfe744975fff01c5f9cf887515627a5cfff2e0', '9e33e4db46102e7584fb8be285a0b3ca883b7993')
  'functions/jobs.js' = @('1552d23f2ffd1e74b4e97c469d40ad8826ce037b')
  'functions/package.json' = @('912ee5203a5333d878d0fe05fd7339a4c3f420b1', '8cca7924532b653b0caa8b75774a3e3e5aa91e72')
  'functions/scripts/shop.test.mjs' = @('3a42ef82cdab744eff21f09a54214b6656fd944b', '6752835d59305f27cc5f855b9d48b69879efa363', '2cf0da40d9a820f10f162551cade8ae1392bb253')
  'functions/scripts/v151-jobs.test.mjs' = @('6998cb6296c4f5c50d273cfff1de2fe64c86c13e')
  'functions/shop.js' = @('2a32b5da452c835ecf16a31939d09500f4009981', 'c54c6e37eb088534d41f6004192e2e60a2800222', '7c5e610fc3d2e183c17ee265be6c0c261c28adfb', '55d6c659ff31a7e1f3f42ba5b10efb4cf989ca60')
  'functions/vehicleKinds.js' = @('b4b694653d8a1dae7dd02e0634c0197d6342a652')
  'functions/vehicleMods.js' = @('5a0fc3423dc79732f6d7c4d661eaed6288a9b5ca', '571b90706d4a905040f013adefdaf2476ebb51b1')
  'preview/mocks/backend.js' = @('7f2de5db2dffc3a735fbdbcd0603abbcae89f694', 'dee5036c89b9f7c468a5aef501dcf8da2e2f7d7b', '86c7e04d37bbf77541fb231f69e8420a862626eb')
  'preview/mocks/firebase-auth.js' = @('7a9216d1dee2632f6c649e959869cd87f91bd111', '8b3ea77160a6967793857252c63e8f02c1eb04ff')
  'src/App.jsx' = @('20a030bc55478c140db706cdbda90c728860f82c', 'ebd0648bbf5d98f0930bbf691f6b9177540a8d6e')
  'src/components/City/City.css' = @('fb2c700e296ec77f28b20986b1607283008bee2f', '79965f1c7d6674b9827d20e844f22698a7b5eaaf', '85e42a9fcb0233acac54917dadf922f7bbc8ce52', 'e1de609a6fd12fcb83ebd42729d6fb212dcbc6ad', '550df1faac655adc582cd9d0650ea4065c700be3')
  'src/components/City/CityPhoto.jsx' = @('dd5f289ca9ed9999077b8a92a518fdd25b1d86dd', '0dc9ded7d937240c2b92fe10ce952e9b38dd576b', '72f6cce851eefccfd6486f61e255b5088be39471')
  'src/components/City/CityScreen.jsx' = @('469230d2e09d33798ec28e2c686c925eb4c5ea10', '9c6e9bdb6825f18d9ecaaba7238d2508e99bba38', '3e96bb3883770aed63dc8cf8e4520c21384aa6db', 'e80b5dfe2177859ac4df3788cdcf07509378e56c', '5d53bc1d4c35a45cb2e77c80130e45b99c3e9ad8', 'f59587f50726f6d2f07d2e4905a2d07aac7e4908')
  'src/components/City/buildings.js' = @('f928ef2c554758f8dacf2f335208bbc048aecdf7', '2ca7fa7daf36abf16ab16d3eddf03a6571aa0246')
  'src/components/City/cityEngine.js' = @('1a449e364cc4e96415f63a463a6d0d8708c77dc1', '76532b0b3f69bad9ef7dd66655af22f7e5eb2f9e', '1a0d43ab8d9db581eb3a7ccdd7286d5716652dae', '326ce9e63f76157813e6e842af2130d984e6d42c', 'ae9cc0ac0365127dd6a03611613cac5c09f49231', '8c861a95050c4f67931d8cecc0f2c292fd630a49')
  'src/components/City/cityJobs.js' = @('748ad8b5f1a739de1d445383e8f1f48976045801', '69e789f4c2b430f0cefc390b79aea4605682a2ef', 'de438c45d619848688cf851d1a23f9e11282d657')
  'src/components/City/cityLayout.js' = @('dba7daa6c79da31624ad26c232521a804229ca7e', 'b2e8b56203ff6d1e7684de24437c6461383157ec', 'd066b5b7bdfb21991cfc070184c494b6a49215e8')
  'src/components/City/cityNet.js' = @('bacf067421a10a2db79cb606b5ba2cc40a21d394', '61f2f7e548f3fc2df0fe2dbbfbb6b68df9e5c7e7', '4fa95f88c1ded55bf67adc0fc876185528de90f8')
  'src/components/City/cityPlan.js' = @('64d694b5a01316698cf139a6e9e10f9fce12ca99', '30d11e93fae7715d77f22927d9f88c77f3e5484c')
  'src/components/City/jobBuildings.js' = @('8689a93eada0f9be794db1e159f76c0f90985b0d', '150b2495d7731ed3aa72c36041c88ef21e5c97b7')
  'src/components/City/jobWorld.js' = @('be8d38d469da2f9c0c96dc18e730514599fbdcff', '096ca4ff404bb6d5176e1c3e306adec2760beee8', '035f0e304c868c8d57d210c2a0d5504404c055c2')
  'src/components/City/kit.js' = @('2e31b959f317756caf628ff9f70a0ae348e7eef6', '147a381e297dc56beee6ec9d77ba3864de62853a')
  'src/components/City/stadium.js' = @('753c99a441c8f97f67a940bf380c6ea5cf1d489c', '66ecb2d0c541cde441327243771f3a77743d295c', '53a6d039978c19dd71e3072a541a8341d93ca6d6')
  'src/components/City/stadiumMatch.js' = @('c5a443da3dbee83fd3934398e46ff3df174a32ec')
  'src/components/City/vehicles.js' = @('bef43e534033b7771f64a7d79fb4f13b3501f3f5', '28969fd86b75342c3b54138b5eb6ccbefca1aa26', '04a1ef56a1a45e1be02488b433e2a53b72b8f5b1', '74686cc7d341d14bca3419378bcd18bef80547fc')
  'src/components/FutbolScreen/FutbolLigler.jsx' = @('a1c0126006fc129de11a0bc5b69e9fef6c3f9b69', '77d2449106fbbc9538df94768b1acaa29b0dcfff')
  'src/components/FutbolScreen/FutbolTakimim.css' = @('dc8f146c18970cee884ae09a3fd8936568523f10', '558372306a43a563426e189e8c9710ef3abe0104')
  'src/components/FutbolScreen/FutbolTakimim.jsx' = @('5d1f07f47c2b004f4a4e07f57de9f3b0b8a6376c', '095c49f61fddc6cab5e290a683671fd42af684f2')
  'src/components/Gangs/itemInfo.js' = @('9c2526345200e0d74c34a64410edc0f74ce0f1dd', '13dc9b8bb4f95b24ef525fe99aa9b6a6057a09e8')
  'src/components/Gangs/tabs/TradeTab.jsx' = @('a23abe73f8a12201190d7ca78a35092f5553418c', '3994467c4e875c174eee6bdb325da11e1e5713eb')
  'src/components/Guest/GuestVenueScreen.jsx' = @('c1ad5218ad6303f113dce9acb89946d97146cb75', '1c3749ec9a0ac045bc9df604bf6eabc5304444a6')
  'src/components/GuideScreen/guideContent.js' = @('9128216b8a40531154e358cc7e3fb34c6225720e', '010ae59a125b3db51c646e3f6dcbab1dc45ae611')
  'src/components/HouseScreen/HousePhoto.jsx' = @('50349f2e560f610ead23a604b53fbb1c9d71430d', '8eb43c42b24cd60e24e3fd62d5a9e63f957a8fcc')
  'src/components/HouseScreen/HouseScreen.jsx' = @('b903da92a585cd24c41f8709ac374883c80bf788', 'b3c27b57921221bcd830c909c6bb8fbe8ef2eba3', '18bd33ac3caca38131a491ec0620dc2d6b96e01c')
  'src/components/HouseScreen/houseEngine.js' = @('fa5d754b81d0c07d7fe247ccd0579531c9aec0ee', '210fef42df2fcea4ab23c5e5209ec15151afd826')
  'src/components/MarketplaceScreen/MarketplaceScreen.jsx' = @('b1ff0c8d9a4388f31577ce18aa42ac3142fb225f', 'bb49ed8e9d554775bf32a92b845044ddaa91b86c')
  'src/components/MekanlarScreen/VisitTab.jsx' = @('02608225abd68657f55bd66ce44578ca7d949e46', '8256b3210f3e4ab963cd4a93079cf781c4caa021')
  'src/components/NearbyPlayers/NearbyPlayersButton.jsx' = @('f714fb84dd78ba379d48d79f31885eab3eb3a83c', 'd3a627aa52afc7796bc305115bcdbb849e650245')
  'src/components/RaceTrackScreen/ChampionshipScreen.jsx' = @('45bcfd5e0623a40064a230dee85b87f7bce34508', 'dc0be8ba85f899953b3510730c70d9922a1bcd6b', '5b6e9bd599d1eb34037a43d5381cfcea07cb4e6d')
  'src/components/RaceTrackScreen/RaceLobby.jsx' = @('971c9ef771f27d3e3e69af6b68120eaea9068fd8', '6b583666e058c3ba64b10819ec63940482ba4ba1', '47b1dad507e2c83e2d85b654d989d3de2bd7a412')
  'src/components/Shop/ShopOwnerPanels.jsx' = @('170def2e38a4fda2e61915d317f89aeb593d434a', 'd87c355c657e6d0231dacbd639bdb57f427f6fff', '9026a9bd6b848f2cf734e92e5bdff5e0c29f8898')
  'src/components/Shop/ShopShowcase.jsx' = @('cbc5553c89a6b075e0349d3fc51f3567c70a784c', '3a5a0d97524f84954ea2fa886ddaf8da8c307671')
  'src/components/Sixtagram/ComposeModal.jsx' = @('59d537bfca5d44fafe60e5294ccda9f2b6f32238', '2da166ddba64295d23afddd000aca862913fb175')
  'src/components/Sixtagram/PostAttachment.jsx' = @('4a26f95f5763b2af33d892138c9292df9cb83b77', '59a9aee0602becb38ce36ae870476709046d3c74')
  'src/components/Sixtagram/SixStories.jsx' = @('6c1f90e8c8755101a254043dde0c922ad5baf3cc', 'c1ff156312183f7247dd861b1ebf5237da5cbc51', '57f0d02b4109a7dadd0d73b457147d36f5b51809')
  'src/components/Stream/StreamHost.jsx' = @('95b5106ed1c650dfd0ae29fe1222abf85d8cfe36', '6d264b2cc962716ff3bac4f56f04e111ea83c70a')
  'src/components/Stream/StreamViewer.jsx' = @('cb07a84898bb0d0f6410d822cdeb3ca259e674b1', '71ac0f26aa3dea88864966cdcad00c702e2f0aad')
  'src/components/VehicleCard/CarImg.css' = @('b9335b592ad5cbee40c5f43972b708b56eeed1b5')
  'src/components/VehicleCard/CarImg.jsx' = @('319ff440b4f19b9ae20c1f2b649aa8b0ab397230')
  'src/components/VehicleCard/VehicleCard.jsx' = @('5fc59c125d90b6536e1d4b474dfb8402a9370ea3', 'a87b2715f48030f5c274bf59f80cbeb4b408e8e7')
  'src/components/VehicleGalleryScreen/VehicleGalleryScreen.css' = @('83ef9744cfa0251162c7d662be7f480d8899f1ab', '34c03acae5c39f10947b841b15e688bd26c72358')
  'src/components/VehicleGalleryScreen/VehicleGalleryScreen.jsx' = @('3f7e59cdc50e48f9e530115ec0afb51faf3e1346', '2f6b65582a67d7d0ba2cbb23214de6041109db5c', 'f2bca7f7f38641083118459350370d61356006a4', 'c2c46830f36e5e58383f2a0a4c84ccf94dc6c869')
  'src/components/Workshop/ModifiyeStudio.css' = @('ef16d741abf077de51a385012559178cea103b9a')
  'src/components/Workshop/ModifiyeStudio.jsx' = @('d2cd06f2b9adeffbb29659870a454e59d70b069c', 'aebb35d36a66d5a43f66fc5eb538d586c6a21144', 'f416a95b181efbcb0d4d23b95b9d39acafb7b4de')
  'src/components/Workshop/Workshop.jsx' = @('9f52bb6c279d4c2ab5e5c1cf5810aeb5d9694d6e', '8284915ad8d3c0f2ab258475c453b764db44dd40', '17172efb613f79f345724068895e4b369925940c', '7910a49e402b30f2957418f31fa6c969a1fe4b94')
  'src/data/vehicleCatalog.js' = @('b3b333c5909097aa1a3ded4b534866432853af53', '6eff6996ee6fbfbdaebabb2b969ef971a3f00b1f')
  'src/hooks/useStadiumMatches.js' = @('10878190d6005548740ab799a15a18bddda9b014')
  'src/lib/bizErrors.js' = @('32dd843b2a125ed4e22a8855978382f2aea5217a', 'a9b4de9a7c9013c12d523c391aaeaf0151161965')
  'src/lib/carThumb.js' = @('3c4f8d8123b4fcf518a4fc20166eef083ecd7b40', '60114aec7448c75f92e1d4f54201f6be542b7755', 'f691b45697827f0890c38b2f7a76c94c0e321e66')
  'src/lib/moneySources.js' = @('3c1bc8fd5a0eebacca8b8ac153e22921e335efa0', '7fb26bbfca9309ef6b9058d4134bf6aeff53e10d')
  'src/lib/photoCache.js' = @('bf34d5c768e8b7be6d6e2b394a331f329b5ce017', 'd57dd2d0d0620c5735abeeaa73ed96f8f2d769b0')
  'functions/cityPhoto.js' = @('096d2b675bd3f919a58c90865c43291ef3cd3ccd', 'a93b2c65c563741e985cdfa2b880bc24ac214ebb', '17f774bd5fd0fc215ca57556f74721cdf74c2d28')
  'src/components/City/areas.js' = @('1dc1877aa72e0b7c36dd21c43f14b68b060f787b', '6c0597c33e6460fe5dad682b49cb9837ff6d89af')
  'src/components/Sixtagram/PostAttachment.css' = @('5e37fae8578f96dd4a1bfd4dbe365cf65f669824', '03be61801abb9e57e9afca670386cf38036e449e')
  'functions/listingBatches.js' = @('4c17332a8a1596996171684da0dac82c558675f8', 'f4aad3f2c9dc0cc06346161b0038cf86f4608aaa')
  'functions/scripts/listing-batches.test.mjs' = @('0e62fc7c6a2871d924b8ea36e50c2edc69d66573', 'b3ca81b0630b989c48e8bb7a6fd1abd8c17e3008')
  'functions/venueLayouts.js' = @('1a83c708ffc1aa7befd77812e4097ac9054a5998', 'ee41b24982991f5c047cb80cba785e97601db104')
  'src/components/HeistPanel/HeistPanel.jsx' = @('6a9f4dc7fdbd3ead8c48d5ec423948ace87570c6', '2a828941f2dc55abb9cd9b04f6aa8239cdc2755b')
  'src/components/MekanlarScreen/SuspicionTab.jsx' = @('bccda52ff6919385f1bf571eb6d341675e7ad7cf', '1e2b1096eee1ce41b9faf8a94e4718cce80a0d02')
  'src/components/VendorScreen/VendorScreen.jsx' = @('148272628660694686f5ac7039a5f8bc76cbf820', '9b2e76cf5467d867857feed68668a270d7914c86')
  'src/components/Venue3D/venueParts.jsx' = @('88ce0e9d2f5bf4852cb8363f74144b5494208d16', 'c4d784bb1e10f9fa6d35b01306378d8555d9fa04')
  'src/hooks/useOnboarding.js' = @('c3016a60de53e3d7dee8a0ce05b6d671937ff42c', 'ab664f9b45105a1c38d04d0f493c59f325aaa137')
  'src/lib/avatarShapes.js' = @('bd44c1da12762e3986e5b890ff88dab732362877', 'e9f94ea60b10a4261ea8884d8e0f32b54a181e38')
  'src/components/City/cockpit.js' = @('f82b8c9bc767ef0e411f71a6eb2fb7fa798d45d0')
  'V152-DEGISIKLIKLER.md' = @('ab3682855bedd0f92f1471ec850eb25f38cbe248')
}
git cat-file -e dee8518 2>$null
if ($LASTEXITCODE -ne 0) { Dur "Bu bilgisayardaki git gecmisinde v148 (dee8518) yok. Once 'git pull' yap, sonra tekrar calistir." }
$degisen = @()
foreach ($f in $izinli.Keys) {
  if (-not (Test-Path $f)) { continue }
  $h = (git hash-object -- $f).Trim()
  if ($izinli[$f] -notcontains $h) { $degisen += $f }
}
if ($degisen.Count -gt 0) {
  Write-Host "Su dosyalar v148-v152'den sonra baska sekilde degismis:" -ForegroundColor Yellow
  $degisen | Sort-Object | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
  Dur "Ustune yazarsam bu degisiklikler kaybolur. HICBIR SEY YAPILMADI. Bu listeyi Claude'a gonder."
}

# ---------------------------------------------------------------- 3) dosyalari yerlestir
$tmp = Join-Path $env:TEMP 'neon-v153-zip'
Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
try {
  Expand-Archive -Path $zip -DestinationPath $tmp -Force -ErrorAction Stop
} catch {
  Dur "Zip acilamadi: $($_.Exception.Message)"
}
Write-Host ""
Write-Host "===== dosyalar yerlestiriliyor =====" -ForegroundColor Cyan
try {
  Copy-Item -Path (Join-Path $tmp '*') -Destination $PSScriptRoot -Recurse -Force -ErrorAction Stop
} catch {
  Dur "Dosyalar kopyalanamadi: $($_.Exception.Message)"
}
foreach ($f in @('functions\vehicleMods.js', 'functions\jobs.js', 'functions\vehicleKinds.js', 'functions\cityJobsData.js', 'src\components\City\cityJobs.js', 'src\components\City\jobWorld.js', 'src\components\City\jobBuildings.js', 'src\lib\carThumb.js')) {
  if (-not (Test-Path $f)) { Dur "Zip eksik acildi: $f yok." }
}
# v149: yayinda mac izleme kaldirildi
foreach ($f in @('src/components/Stream/StreamMatchView.jsx', 'src/components/Stream/StreamMatchMirror.jsx')) {
  if (Test-Path $f) { git rm -q -f -- $f 2>$null; if (Test-Path $f) { Remove-Item -Force $f } }
}
Write-Host "Tamam." -ForegroundColor Green

# ---------------------------------------------------------------- 4) derle + test
Write-Host ""
Write-Host "===== arayuz derleme kontrolu =====" -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { Dur "Arayuz derlenemedi. HICBIR SEY YUKLENMEDI (site eskisi gibi calisiyor). Ciktiyi Claude'a gonder." }

Write-Host ""
Write-Host "===== WebView testleri =====" -ForegroundColor Cyan
node --test tests/webview/webview.test.mjs
if ($LASTEXITCODE -ne 0) { Dur "Testler basarisiz. HICBIR SEY YUKLENMEDI. Ciktiyi Claude'a gonder." }

Write-Host ""
Write-Host "===== fonksiyon dosyalari kontrolu =====" -ForegroundColor Cyan
Push-Location functions
node -e "import('./shop.js').then(()=>console.log('shop.js tamam')).catch(e=>{console.error(e);process.exit(1)})"
$ok = $LASTEXITCODE
Pop-Location
if ($ok -ne 0) { Dur "functions/shop.js yuklenemedi. HICBIR SEY YUKLENMEDI. Ciktiyi Claude'a gonder." }

Write-Host ""
Write-Host "===== fonksiyon testleri (dukkan + meslek) =====" -ForegroundColor Cyan
Push-Location functions
node --test scripts/shop.test.mjs scripts/v151-jobs.test.mjs scripts/listing-batches.test.mjs
$ok = $LASTEXITCODE
Pop-Location
if ($ok -ne 0) { Dur "Fonksiyon testleri basarisiz. HICBIR SEY YUKLENMEDI. Ciktiyi Claude'a gonder." }

# ---------------------------------------------------------------- 5) RTDB kurallari (SITEDEN ONCE)
Write-Host ""
Write-Host "===== Realtime Database kurallari =====" -ForegroundColor Cyan
firebase deploy --only database
if ($LASTEXITCODE -ne 0) {
  Write-Host "Kural yuklenemedi. 30 sn bekleyip bir kez daha deneniyor..." -ForegroundColor Yellow
  Start-Sleep -Seconds 30
  firebase deploy --only database
  if ($LASTEXITCODE -ne 0) { Dur "Realtime Database kurali yuklenemedi. git push YAPILMADI (site eskisi gibi). Ciktiyi Claude'a gonder." }
}

# ---------------------------------------------------------------- 6) fonksiyonlar (SITEDEN ONCE)
# shopAction (otobus duraklari, malzeme ilan suresi), buyFromVendor (bagis: ele urun gelmez),
# attemptHeist / createHeistPlan / joinHeistPlan (mesaj metni), createListing / buyListing (3 gun),
# cityAction + createSixtagramPost (fotografa stadyum sponsorlari), cronTick (ilan suresi dolumu).
$gruplar = @(
  @('shopAction', 'buyFromVendor', 'attemptHeist', 'createHeistPlan', 'joinHeistPlan'),
  @('createListing', 'buyListing', 'cityAction', 'createSixtagramPost', 'cronTick')
)
$basarisiz = @()
$i = 0
foreach ($g in $gruplar) {
  $i++
  $only = ($g | ForEach-Object { "functions:$_" }) -join ','
  Write-Host ""
  Write-Host "===== Fonksiyonlar $i / $($gruplar.Count): $($g -join ', ') =====" -ForegroundColor Cyan
  firebase deploy --only $only
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Bu grup hata verdi (kota olabilir). 120 sn bekleyip bir kez daha deneniyor..." -ForegroundColor Yellow
    Start-Sleep -Seconds 120
    firebase deploy --only $only
    if ($LASTEXITCODE -ne 0) { $basarisiz += $g }
  }
  if ($i -lt $gruplar.Count) { Start-Sleep -Seconds 60 }
}
if ($basarisiz.Count -gt 0) {
  Dur "Su fonksiyonlar yuklenemedi: $($basarisiz -join ', '). git push YAPILMADI (site eskisi gibi). Script'i biraz sonra tekrar calistirabilirsin; ciktiyi Claude'a gonder."
}

# ---------------------------------------------------------------- 7) commit + push
Write-Host ""
Write-Host "===== git commit + push =====" -ForegroundColor Cyan
$ekle = @('src', 'functions/index.js', 'functions/itemRules.js', 'functions/shop.js', 'functions/vehicleMods.js', 'functions/catalogData.js', 'functions/vehicleKinds.js', 'functions/cityJobsData.js', 'functions/jobs.js', 'functions/cityPhoto.js', 'functions/listingBatches.js', 'functions/venueLayouts.js', 'functions/package.json', 'functions/scripts/shop.test.mjs', 'functions/scripts/v151-jobs.test.mjs', 'functions/scripts/listing-batches.test.mjs', 'preview/mocks/firebase-auth.js', 'preview/mocks/backend.js', 'database.rules.json', 'V149-DEGISIKLIKLER.md', 'V150-DEGISIKLIKLER.md', 'V151-DEGISIKLIKLER.md', 'V152-DEGISIKLIKLER.md', 'V153-DEGISIKLIKLER.md', 'deploy-v153.ps1', 'deploy-v153.bat', 'deploy-v153-simdi.bat') | Where-Object { Test-Path $_ }
git add -- $ekle
$gizli = git diff --cached --name-only | Select-String -Pattern '(keystore\.properties$|\.keystore$|\.jks$|local\.properties$|\.aab$|\.apk$|\.env$)'
if ($gizli) {
  git reset -q
  Dur "Gizli/derleme dosyasi commit'e girecekti: $gizli  -> commit YAPILMADI. Claude'a gonder."
}
git commit -q -m "v153: fabrika ilanlari 3 gunde kapanir, seyyar saticiya bagis, sehirde harac animasyonu, yeni arac ici kokpit, modifiye/galeri aciklamalari kaldirildi, fotografta stadyum sponsorlari, is guzergahi yolda ve haritada, otobus duraklari icten ve distan; v149-v152 dahil" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_0182eo1GukBVJkhsdTAoHWBc"
if ($LASTEXITCODE -ne 0) { Dur "git commit basarisiz (degisiklik yok ya da git hatasi). Ciktiyi Claude'a gonder." }
git push
if ($LASTEXITCODE -ne 0) { Dur "git push basarisiz. Commit bilgisayarinda duruyor ama site eski. Ciktiyi Claude'a gonder." }

Write-Host ""
Write-Host "TAMAM: v153 gonderildi. Cloudflare birkac dakika icinde yayinlar." -ForegroundColor Green
Write-Host "Kontrol: seyyar saticida Bagis yap + Harac kes animasyonu, arac ici kamera, Ise basla -> yoldaki ok seridi ve haritadaki cizgi, otobus duraklari." -ForegroundColor Cyan
