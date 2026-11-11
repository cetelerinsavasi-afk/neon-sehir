# Neon Sehir v154 - cift tiklayinca: zip'i yerlestir + derle + test + RTDB kurali + fonksiyonlar + commit + push
#   Faz 1-10: yolcu kamerasi, otobus 28 koltuk, yeni soygun tablosu + midyeci/dondurmaci, sade soygun paneli,
#   soygun videolari, donma/sifirlanma/isinlanma duzeltmeleri, sehir ici fabrika/yaris paneli, pit lounge,
#   taksi duragi, stadyum otoparki, fotograf duzeltmeleri + mac fotografinda futbolcular, kisa takim adlari,
#   makineler (1,5 kat / isciz 1/3 / +1.000 fiyat), polis zaferi (gucun 1/10'u devlete), motokurye.
#   1) neon-sehir-v154.zip dosyasini proje klasorune acar (once guvenlik kontrolu)
#   2) Arayuz derlemesi + WebView/sehir testleri + TUM fonksiyon testleri (hata varsa hicbir sey YUKLENMEZ)
#   3) Realtime Database kurallari (otobus koltuk siniri)
#   4) Firebase fonksiyonlari (30 fonksiyon, 6 grup, 5'erli) - SITEDEN ONCE. Yarida kalirsa tekrar
#      calistir: tamamlanan gruplar atlanir (.deploy-v154-tamam.txt).
#   5) git commit + push  -> Cloudflare siteyi yayinlar
#   Firestore kurallari / indeksler DEGISMEDI.
#   Cift tikla: deploy-v154.bat (yogun saatte: deploy-v154-simdi.bat) - soru sormaz.

$ErrorActionPreference = 'Continue'
Set-Location -Path $PSScriptRoot
$env:GIT_ASK_YESNO = 'false'

function Dur($mesaj) {
  Write-Host ""
  Write-Host $mesaj -ForegroundColor Red
  exit 1
}

$dk = (Get-Date).Hour * 60 + (Get-Date).Minute
if ($env:NEON_SIMDI -ne '1' -and ($dk -ge 1380 -or $dk -lt 60 -or ($dk -ge 1065 -and $dk -lt 1155))) {
  Write-Host "Su an yogun saat (23:00-01:00 / 17:45-19:15). Bu saatlerin disinda tekrar calistir ya da hemen yuklemek icin deploy-v154-simdi.bat kullan." -ForegroundColor Yellow
  exit 1
}

if (-not (Test-Path 'package.json') -or -not (Test-Path 'src\components\City\cityEngine.js')) {
  Dur "Bu dosyalar neon-sehir proje klasorunun ICINDE olmali (package.json bulunamadi)."
}

# ---------------------------------------------------------------- 1) zip'i bul
$zip = $null
foreach ($aday in @("$PSScriptRoot\neon-sehir-v154.zip", "$env:USERPROFILE\Downloads\neon-sehir-v154.zip")) {
  if (Test-Path $aday) { $zip = $aday; break }
}
if (-not $zip) { Dur "neon-sehir-v154.zip bulunamadi. Zip'i bu klasore (ya da Indirilenler'e) koy ve tekrar calistir." }
Write-Host "Zip: $zip" -ForegroundColor Cyan

# ---------------------------------------------------------------- 2) guvenlik kontrolu
# Her dosya ya Claude'a gonderdigin zip'teki (11 Kasim) halinde, ya bir v154 faz zip'indeki halinde ya da zaten v154 halinde olmali.
# Baska bir degisiklik varsa ustune yazmak onu siler -> dur.
$izinli = @{
  'database.rules.json' = @('fc665e6a1e1b331b04abfb317d3142a2a79a2029', '76f8b0071b75dddb23cb4092c7d03b7ed21a03af')
  'functions/catalogData.js' = @('63a6c4350550f11ba82bff4c69c85090561575a2', '0990ae5c7c41222a0d79001e290217a33594ab78')
  'functions/cityJobsData.js' = @('d4c987621dbe47358be5042604af6a9462bb1d5a', '6e00bf8aee27895eb4871d795a4957d673446fbe')
  'functions/cityPhoto.js' = @('17f774bd5fd0fc215ca57556f74721cdf74c2d28', '448fca92c67ef189ebbf67b60b6a24478c53410e')
  'functions/gang/clock.js' = @('93fbbe24b8ba1a8b3298ca6c17313cf0e8981ca7', '8b636a8b928f4e997fd1e1d0e8f18f347c57b005')
  'functions/gang/config.js' = @('973d011cde27273b23764444c4068f2e7a94e2e5', '66f1b2e501144365b51bf778e0ed4ad9f7cf4d5d')
  'functions/gang/test/heist-ledger.test.js' = @('f8f84ed8a2021157b221a027940ef905bf88aaf7', 'c43b38ab25ca8a5305df792240d28141068bf017')
  'functions/gang/test/wars.test.js' = @('3132bd368454ca54c023a0d5344875df0563468e', 'f2bca7c13b0cffc679f385d3e5b36ef41a6b2d77')
  'functions/houseCatalogData.js' = @('9dd636244418126cdced2f7d40acb55f8a0629eb', '91eaedf0a4e9db17e1115640812e524c4f3a34c4')
  'functions/index.js' = @('93ac5d59b43570478578ede5808db7c6c3a58386', '50c802e94ef19b51ce9db8e90bc5dc8b8347a762', '48ef246bc8f9c1b95c9bdca149945c5b3d46a505', '2d2704d4272a0b65b0ff64f52156ac04700a77f8')
  'functions/jobs.js' = @('1552d23f2ffd1e74b4e97c469d40ad8826ce037b', 'db598883e06396bfeb1f665862d05f8208cc635e')
  'functions/package.json' = @('8cca7924532b653b0caa8b75774a3e3e5aa91e72', '692f1b44425b3d160cc57ea94c20c7f18c07807d', 'fc2fbd60c5075f697e74e6a5ef6a4e533b53b5d0')
  'functions/policeRules.js' = @('420029d637f4c9034225c5e6f4017414819228e9', 'c7ba6fb4cbb499732eeb1350c2a331ead282f85f')
  'functions/scripts/houses.test.mjs' = @('c473cbfbd5dd18e746717a7a98b81be28d583e8b', 'f23676637e65edfa6a73b090473fe7fd898aa8cd')
  'functions/scripts/v145.test.mjs' = @('8d87da4d5d9a94b137ad09619d299afc0e74c00f', '7e02d8893f2c848196eacd27ce6a58081a52dd96')
  'functions/scripts/v147-cityphoto.test.mjs' = @('85469f7a4a43e17ba813008ccc9e15751307d2dc', '4e4e42a7fab83688e7d80764bb15326a54ac7917')
  'functions/scripts/venue.test.mjs' = @('ac91ea61694addecd8a8f3ae3b02bbc0f1e16126', 'ce266ff5cac5c8fa810d5579f6e04bd8c458a668')
  'functions/vehicleKinds.js' = @('b4b694653d8a1dae7dd02e0634c0197d6342a652', '4e4deaeba95aabc8c15e67ee384e21f5457b7597')
  'functions/vendorData.js' = @('f12265ffb1415d256838ae7764b8b199813b283c', '8f74774ef2df58bc8479abc8cf94f68b44a35bc4')
  'functions/venue.js' = @('22ab4af0aa8ad90be8cdf989b4d92c27b89fe8c6', 'c41916bb50a56b9967aa6577351b0bd469c035cc')
  'functions/venueLayouts.js' = @('ee41b24982991f5c047cb80cba785e97601db104', '30c5a3e589f78a15960351fe1e7f471969a67720')
  'functions/visits.js' = @('0941d16b2b2947a4d4d452de61cbbd5fcacedb8a', '32e75a5cc2b0790a56e19923001abed4685ed94b')
  'preview/mocks/firebase-firestore.js' = @('f4467207aced04885317d7587126ddd1f66fe950', '6f5cb0c54f4fe39cde589f7049c8926b3f808b1f')
  'preview/mocks/firebase-functions.js' = @('cf345578a6c10c0908d05d8f1d358cfd5e0d9f7d', 'ec8af09e1811e138a61e3245b21fdb686bce2224')
  'src/App.jsx' = @('ebd0648bbf5d98f0930bbf691f6b9177540a8d6e', 'aec10026c03a9a0256f3816d3339f09024356cc5')
  'src/assets/sehir-haritasi.jpg' = @('768a2484579dfad7ac88e4a9ff4333f12e0a86a7', '0c5aa8c329539645e93ad722cec565645f6b143a')
  'src/components/Belediye/BakanliklarTab.jsx' = @('1069be0f242e283f4d4e10d0864b99fd345feac6', 'd05f359fdb37feea7f0f9893b9781201ca6287d4')
  'src/components/City/City.css' = @('550df1faac655adc582cd9d0650ea4065c700be3', 'be62f8c63b13af80bc3df6c3490ae8cc245da474')
  'src/components/City/CityScreen.jsx' = @('f59587f50726f6d2f07d2e4905a2d07aac7e4908', '3f4e8db8ff699ed88800fc08ba23f316c89c74ab', '2736a5e5b25131d3e106bb42ace738fba65e2ee7', '40ef5f1a4d98920b0dee1b59c443b22dac329e23', 'bfe2f66a9294470c0f646e6432f27aae9acd6e00', '937c5a1124614c1f444bd69bfaa11aaae7e0db60')
  'src/components/City/areas.js' = @('6c0597c33e6460fe5dad682b49cb9837ff6d89af', 'a14a060a384d7b17325f0fda88e1d824865056ab')
  'src/components/City/buildings.js' = @('2ca7fa7daf36abf16ab16d3eddf03a6571aa0246', 'dfee7aafc91e550c55f65d2b78b1d3b05e7526e2')
  'src/components/City/cityEngine.js' = @('8c861a95050c4f67931d8cecc0f2c292fd630a49', '1a7849d01a9c7c057740981da75a8f028835c8c1', '55bdbb527abb1fc5ed8048fbb334143ff85470a8', '29a43ae97ea6090abfccda73aff714a6fa2696dd', 'e7def57ea4e0a1ce5684bbf4843e3f00645bfb3a', 'c188546407e0078c1a8e1ea74d9a394a42333eb2', 'fe6e1015828d5ef769472621f6a5714683a2473b')
  'src/components/City/cityJobs.js' = @('de438c45d619848688cf851d1a23f9e11282d657', 'b1387260afafed8b62aa46be585904dd38cc89cb', '019ac34ff55ea100aa59b6d3fbfa12225102a87c')
  'src/components/City/cityLayout.js' = @('d066b5b7bdfb21991cfc070184c494b6a49215e8', '349361ab4e2062374fd885e419cd9ff9b59dbf86')
  'src/components/City/cityPlan.js' = @('30d11e93fae7715d77f22927d9f88c77f3e5484c', '49703bfa08a92fadbfb3d9149468921f09405c6b', '421c5f2651a30c2fe9ffbc09ceec996e3c05db3f', '50ef39a57d181c67c6e03407f80eb5db9c856e74')
  'src/components/City/cockpit.js' = @('f82b8c9bc767ef0e411f71a6eb2fb7fa798d45d0', '8e5528e834c0e60ab30fc8ccb6a9d79b441429af')
  'src/components/City/jobBuildings.js' = @('150b2495d7731ed3aa72c36041c88ef21e5c97b7', '097bd755feaeb60c3c73e9fe88461fd7689bbc1d')
  'src/components/City/stadium.js' = @('53a6d039978c19dd71e3072a541a8341d93ca6d6', '205e46da9367442a39a955f9781057f24d68792e')
  'src/components/City/stadiumMatch.js' = @('c5a443da3dbee83fd3934398e46ff3df174a32ec', 'd624a59dea72ed00ad3774529c4dccbba5be17c3')
  'src/components/City/vehicles.js' = @('74686cc7d341d14bca3419378bcd18bef80547fc', '15c4534a84617b8f96be1886470a15716293c87b')
  'src/components/FactoryScreen/FactoryScreen.jsx' = @('6ce78d3025c191769d171e8a446c581c08ba13ba', '1cb7395c92e13826549658b92ec0d1bba2c569b7')
  'src/components/FactoryScreen/factoryHelpers.js' = @('29dd3f945a9601d752b6854a6ddd5286e8fa1c5e', 'cfc04db80065593f9c61b54f41f479aa7631fd15')
  'src/components/Gangs/tabs/CetemTab.jsx' = @('f39348028e8104fa45e1df85d1417c2ce2d8d300', '87b92c0e52f729f7f5aeee741ed1777eb85138d4')
  'src/components/Gangs/tabs/TradeTab.jsx' = @('3994467c4e875c174eee6bdb325da11e1e5713eb', '8a91aff6bb17dd949155e29ef26d35c44d6184ab')
  'src/components/HeistPanel/HeistPanel.css' = @('d9874395244f74c9c8c5d556838443453f7b383e', '819b8e39ed5bcb9ff252d08176bd5426f2dda25d', 'f59c683d4f2b330b33a6f9de4cbc0556153623ec')
  'src/components/HeistPanel/HeistPanel.jsx' = @('2a828941f2dc55abb9cd9b04f6aa8239cdc2755b', 'da795698a4bf9cab118892660ad84ed510c58137', 'a33a3e6ec7a2f6c5b4f942cee35fa182e19560b5', '60c1ac511973e077fc6e2d28a29c043789ebc1c5')
  'src/components/HouseScreen/HouseScreen.jsx' = @('18bd33ac3caca38131a491ec0620dc2d6b96e01c', 'd05155ab51e49a12445469a3199a60c8b33722bd')
  'src/components/HouseScreen/heldArt.js' = @('330d6dcb1fdb51f3c5a62078ee27c20d5e66bc7a', '10eb5820638b207e2a12816f4ba7dec3b40feddd')
  'src/components/HouseScreen/houseCatalogV145.js' = @('6072e0f0ee81fb0ad4a041678b8c72ac5db02db4', 'e9b7d76d111e0d06f6036d38575ddf0cd388a892')
  'src/components/MekanlarScreen/SoygunTab.jsx' = @('30914e9e6716e8b8557fbb49ad10c2e15ab88cf2', '992eb423ab43ac0ad2b9b8742ee77dbfb83118f8')
  'src/components/MekanlarScreen/SuspicionTab.jsx' = @('1e2b1096eee1ce41b9faf8a94e4718cce80a0d02', 'dce7f83f8bf93c8e8d3d036b763231e99111dff5')
  'src/components/NewspaperScreen/NewspaperScreen.jsx' = @('0bcbbee41dde68587ade21505fcbb08c039f66c8', '647a8fc14ca2ea093aadcc219c986a814e294f30')
  'src/components/Venue3D/VenueLayer.jsx' = @('ced9575dc997e6d8e3c59fdd8c49b20d445cf0a6', 'adc44c8f01dfd3b218c23cf9d166699957c48578')
  'src/data/regions.js' = @('4cba0f05c5cf106b574f6599fbe30650d227d3dd', '5d062e526d001ce70fff0a7a76738287254b6bf5')
  'src/data/vehicleCatalog.js' = @('6eff6996ee6fbfbdaebabb2b969ef971a3f00b1f', '524b3bb3b52f8ae3b40640bab4d6569faee531d6')
  'src/hooks/useMyActiveHeistPlan.js' = @('b51e7fcb8aed7f4b2a61d04caa58396ec4984c1a', '04b2a79a4ac70a01a02eaf9c8ac85b77c490191e')
}
$degisen = @()
foreach ($f in $izinli.Keys) {
  if (-not (Test-Path $f)) { continue }
  $h = (git hash-object -- $f).Trim()
  if ($izinli[$f] -notcontains $h) { $degisen += $f }
}
if ($degisen.Count -gt 0) {
  Write-Host "Su dosyalar Claude'a gonderdigin zip'ten sonra baska sekilde degismis:" -ForegroundColor Yellow
  $degisen | Sort-Object | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
  Dur "Ustune yazarsam bu degisiklikler kaybolur. HICBIR SEY YAPILMADI. Bu listeyi Claude'a gonder."
}

# ---------------------------------------------------------------- 3) dosyalari yerlestir
$tmp = Join-Path $env:TEMP 'neon-v154-zip'
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
foreach ($f in @('functions/factoryMachineRules.js', 'functions/jobs.js', 'functions/cityJobsData.js', 'src/components/City/cityHeist.js', 'src/components/City/HeistVideo.jsx', 'src/components/City/cityJobs.js')) {
  if (-not (Test-Path $f)) { Dur "Zip eksik acildi: $f yok." }
}
# v154: kafe suphe dusurme dugmesi kaldirildi
foreach ($f in @('src/components/Venue/CafeCalmButton.jsx')) {
  if (Test-Path $f) { git rm -q -f -- $f 2>$null; if (Test-Path $f) { Remove-Item -Force $f } }
}
Write-Host "Tamam." -ForegroundColor Green

# ---------------------------------------------------------------- 4) derle + test
Write-Host ""
Write-Host "===== arayuz derleme kontrolu =====" -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { Dur "Arayuz derlenemedi. HICBIR SEY YUKLENMEDI (site eskisi gibi calisiyor). Ciktiyi Claude'a gonder." }

Write-Host ""
Write-Host "===== WebView + sehir testleri =====" -ForegroundColor Cyan
node --test tests/webview/webview.test.mjs tests/city/jobs-resume.test.mjs tests/city/kurye.test.mjs
if ($LASTEXITCODE -ne 0) { Dur "Testler basarisiz. HICBIR SEY YUKLENMEDI. Ciktiyi Claude'a gonder." }

Write-Host ""
Write-Host "===== fonksiyon testleri (hepsi) =====" -ForegroundColor Cyan
npm --prefix functions test
if ($LASTEXITCODE -ne 0) { Dur "Fonksiyon testleri basarisiz. HICBIR SEY YUKLENMEDI. Ciktiyi Claude'a gonder." }

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
# 1 meslek/sehir/fotograf/mekan - 2 cete + satici + soygun - 3-4 ekip soygunu (memberUids) + makine alma
# 5-6 fabrika uretimi + 00:00 (isciz 1/3) + belediye raporu
$gruplar = @(
  @('shopAction', 'cityAction', 'createSixtagramPost', 'houseAction', 'recordVenueVisit'),
  @('gangAction', 'gangClock', 'buyFromVendor', 'attemptHeist', 'claimPoliceSalary'),
  @('createHeistPlan', 'joinHeistPlan', 'leaveHeistPlan', 'kickFromHeistPlan', 'cancelHeistPlan'),
  @('executeHeistPlan', 'expireHeistPlans', 'refreshHeistPlanParticipants', 'updateHeistPlanNote', 'buyFactoryMachine'),
  @('createFactory', 'getFactoryValue', 'produceAtFactory', 'runFactoryMachines', 'dailyReset'),
  @('dailyResetRecovery', 'belediyeAction', 'getStateReport', 'cronTick', 'sellContrabandAtPark')
)
$durum = Join-Path $PSScriptRoot '.deploy-v154-tamam.txt'
$tamam = @()
if (Test-Path $durum) { $tamam = Get-Content $durum }
$basarisiz = @()
$i = 0
foreach ($g in $gruplar) {
  $i++
  $ad = $g -join ','
  if ($tamam -contains $ad) { Write-Host "Grup $i zaten yuklendi, atlaniyor." -ForegroundColor DarkGray; continue }
  $only = ($g | ForEach-Object { "functions:$_" }) -join ','
  Write-Host ""
  Write-Host "===== Fonksiyonlar $i / $($gruplar.Count): $($g -join ', ') =====" -ForegroundColor Cyan
  firebase deploy --only $only
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Bu grup hata verdi (kota olabilir). 120 sn bekleyip bir kez daha deneniyor..." -ForegroundColor Yellow
    Start-Sleep -Seconds 120
    firebase deploy --only $only
  }
  if ($LASTEXITCODE -eq 0) { Add-Content -Path $durum -Value $ad } else { $basarisiz += $g }
  if ($i -lt $gruplar.Count) { Start-Sleep -Seconds 60 }
}
if ($basarisiz.Count -gt 0) {
  Dur "Su fonksiyonlar yuklenemedi: $($basarisiz -join ', '). git push YAPILMADI (site eskisi gibi). Biraz sonra deploy-v154-simdi.bat ile tekrar calistir (yuklenenler atlanir); olmazsa ciktiyi Claude'a gonder."
}

# ---------------------------------------------------------------- 7) commit + push
Write-Host ""
Write-Host "===== git commit + push =====" -ForegroundColor Cyan
$ekle = @('V154-FAZ1-DEGISIKLIKLER.md', 'V154-FAZ2-DEGISIKLIKLER.md', 'V154-FAZ3-DEGISIKLIKLER.md', 'V154-FAZ4-DEGISIKLIKLER.md', 'V154-FAZ5-DEGISIKLIKLER.md', 'V154-FAZ6-DEGISIKLIKLER.md', 'V154-FAZ7-DEGISIKLIKLER.md', 'V154-FAZ8-10-DEGISIKLIKLER.md', 'database.rules.json', 'functions/catalogData.js', 'functions/cityJobsData.js', 'functions/cityPhoto.js', 'functions/factoryMachineRules.js', 'functions/gang/clock.js', 'functions/gang/config.js', 'functions/gang/test/heist-ledger.test.js', 'functions/gang/test/wars.test.js', 'functions/houseCatalogData.js', 'functions/index.js', 'functions/jobs.js', 'functions/package.json', 'functions/policeRules.js', 'functions/scripts/houses.test.mjs', 'functions/scripts/v145.test.mjs', 'functions/scripts/v147-cityphoto.test.mjs', 'functions/scripts/v154-kurye.test.mjs', 'functions/scripts/v154-machines.test.mjs', 'functions/scripts/venue.test.mjs', 'functions/vehicleKinds.js', 'functions/vendorData.js', 'functions/venue.js', 'functions/venueLayouts.js', 'functions/visits.js', 'preview/city-app.jsx', 'preview/city.html', 'preview/mekan-app.jsx', 'preview/mekan.html', 'preview/mocks/firebase-firestore.js', 'preview/mocks/firebase-functions.js', 'src/App.jsx', 'src/assets/sehir-haritasi.jpg', 'src/components/Belediye/BakanliklarTab.jsx', 'src/components/City/City.css', 'src/components/City/CityScreen.jsx', 'src/components/City/HeistVideo.jsx', 'src/components/City/areas.js', 'src/components/City/buildings.js', 'src/components/City/cityEngine.js', 'src/components/City/cityHeist.css', 'src/components/City/cityHeist.js', 'src/components/City/cityJobs.js', 'src/components/City/cityLayout.js', 'src/components/City/cityPlan.js', 'src/components/City/cockpit.js', 'src/components/City/jobBuildings.js', 'src/components/City/stadium.js', 'src/components/City/stadiumMatch.js', 'src/components/City/vehicles.js', 'src/components/FactoryScreen/FactoryScreen.jsx', 'src/components/FactoryScreen/factoryHelpers.js', 'src/components/Gangs/tabs/CetemTab.jsx', 'src/components/Gangs/tabs/TradeTab.jsx', 'src/components/HeistPanel/HeistPanel.css', 'src/components/HeistPanel/HeistPanel.jsx', 'src/components/HeistPanel/heistVideo.js', 'src/components/HouseScreen/HouseScreen.jsx', 'src/components/HouseScreen/heldArt.js', 'src/components/HouseScreen/houseCatalogV145.js', 'src/components/MekanlarScreen/SoygunTab.jsx', 'src/components/MekanlarScreen/SuspicionTab.jsx', 'src/components/NewspaperScreen/NewspaperScreen.jsx', 'src/components/Venue3D/VenueLayer.jsx', 'src/data/regions.js', 'src/data/vehicleCatalog.js', 'src/hooks/useMyActiveHeistPlan.js', 'tests/city/jobs-resume.test.mjs', 'tests/city/kurye.test.mjs', 'deploy-v154.ps1', 'deploy-v154.bat', 'deploy-v154-simdi.bat') | Where-Object { Test-Path $_ }
git add -- $ekle
$gizli = git diff --cached --name-only | Select-String -Pattern '(keystore\.properties$|\.keystore$|\.jks$|local\.properties$|\.aab$|\.apk$|\.env$)'
if ($gizli) {
  git reset -q
  Dur "Gizli/derleme dosyasi commit'e girecekti: $gizli  -> commit YAPILMADI. Claude'a gonder."
}
git commit -q -m "v154: yolcu kamerasi, otobus 28 koltuk, yeni soygun tablosu + midyeci/dondurmaci, sade soygun paneli, soygun videolari, donma/sifirlanma/isinlanma duzeltmeleri, sehir ici fabrika/yaris, pit lounge, taksi duragi, stadyum otoparki, fotograf duzeltmeleri, makineler, polis zaferi, motokurye" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_0182eo1HNT2q1ev1cdukFpYM"
if ($LASTEXITCODE -ne 0) { Dur "git commit basarisiz (degisiklik yok ya da git hatasi). Ciktiyi Claude'a gonder." }
git push
if ($LASTEXITCODE -ne 0) { Dur "git push basarisiz. Commit bilgisayarinda duruyor ama site eski. Ciktiyi Claude'a gonder." }
Remove-Item -Force $durum -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "TAMAM: v154 gonderildi. Cloudflare birkac dakika icinde yayinlar." -ForegroundColor Green
Write-Host "Kontrol: soygun paneli + video, sehirde motor -> Ise basla (motokurye), fabrika Makine Al fiyati, pit lounge, taksi duragi, fotograf." -ForegroundColor Cyan
