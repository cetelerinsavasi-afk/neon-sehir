# Neon Sehir v157.9 - karargah cete profili, cete paneli, Kara Sahinler, hizli Duzenle, telefon bellegi, otobus, saticilar, gise, yatay mod + v157.8/.7/.6/.5/.4 dahil.
#   1) neon-sehir-v157.9.zip'i acar (once guvenlik kontrolu: dosyalar bilinen surumlerden birinde olmali)
#   2) Android: AndroidManifest'e yatay ekran izni + surum 17 / 1.2.2 (build.gradle.kts'in UZERINE YAZILMAZ)
#   3) derleme + sehir/WebView testleri + fonksiyon testleri
#   4) Fonksiyonlar: gangAction + cronTick (cete saati dahil tum zamanlanmis isler) + houseAction + shopAction (at / bisiklet satisi) + cityAction - SITEDEN ONCE
#   5) git commit + push -> Cloudflare siteyi yayinlar
#   Firestore / veritabani kurallari DEGISMEDI.

$ErrorActionPreference = 'Continue'
Set-Location -Path $PSScriptRoot
$env:GIT_ASK_YESNO = 'false'
function Dur($mesaj) { Write-Host ""; Write-Host $mesaj -ForegroundColor Red; exit 1 }

if (-not (Test-Path 'package.json') -or -not (Test-Path 'src\components\City\cityEngine.js')) { Dur "Bu dosya neon-sehir proje klasorunun ICINDE olmali." }
$zip = $null
foreach ($aday in @("$env:USERPROFILE\Downloads\neon-sehir-v157.9.zip", "$PSScriptRoot\neon-sehir-v157.9.zip")) { if (Test-Path $aday) { $zip = $aday; break } }
if (-not $zip) { Dur "neon-sehir-v157.9.zip bulunamadi." }
Write-Host "Zip: $zip" -ForegroundColor Cyan

$izinli = @{
  'functions/houseCatalogData.js' = @('91eaedf0a4e9db17e1115640812e524c4f3a34c4', '8da10aaff469623ad0b02c9b5d2d29fb6182ce99')
  'database.rules.json' = @('76f8b0071b75dddb23cb4092c7d03b7ed21a03af', '79d72d0bdbd1d18c202ab660a40294785cf59e08')
  'functions/catalogData.js' = @('0990ae5c7c41222a0d79001e290217a33594ab78', 'd0050daa6c508a14edb581bbccfa19e7d40d2b6f')
  'functions/cityJobsData.js' = @('6e00bf8aee27895eb4871d795a4957d673446fbe', '179b68a35b734908bfae74082c319e76b44cf19c', 'aba93a75fc21f8e05f5c300d58a6dec1fa3e4d82', 'bb28ba6c125cdfeaadb58c23e98a52cd8d280104')
  'functions/cityPhoto.js' = @('448fca92c67ef189ebbf67b60b6a24478c53410e', 'fdcc5fecce0dfa03e4f5a3ea088b4875723c46fe', 'a962363f1b283d5298f9dd97574a07c54d14599c')
  'functions/gang/actions/intel.js' = @('0ffc13f0b61ac009dec34fdd1a0356b510937b5d', '73bd2714c4655f314f9ff5e0abf746b4cf1df823')
  'functions/gang/actions/membership.js' = @('0c7c0d92a309cf346969014a6f6f0bbc66592072', '323f2d598166e557dda0785ce9511136dd95ad88')
  'functions/gang/clock.js' = @('8b636a8b928f4e997fd1e1d0e8f18f347c57b005', '08a918b40ccb1cf2be42dfe0f086787d3d10765f', '58924842a61e9649b83fd8f70165f86f71b2d565')
  'functions/gang/core.js' = @('10524403343afd5ffac05b5d0fdef4b972ac869c', '6230082dd083db7aed2ebbae5f08b15a756cf4fb', '015b0491787a62f7a7ae35a68d8a42d8c415c72e')
  'functions/gang/test/betintel.test.js' = @('613b94ea779d509734047ac48ff54b65065bdbea', '33d1d97fbd6e3a784b2d2839d2a4cef664eda7cd')
  'functions/gang/test/clock.test.js' = @('5c0073e15c521aff3f0e2926d49dd5613ec06eb1', 'fea1dfa2d7edc11478ae3237ed558c99f33c8c6b')
  'functions/gang/test/exploits.test.js' = @('b8142121b01432da2c752445064bfe80afe8c94e', '3209c1c7bb83e33d5183fc7d6ba0d3ad56e18ff5')
  'functions/gang/test/harness.js' = @('5a14e57ef6391ebf5034a36e67d634db594570da', 'e945b6ff7e7d32c67d1794c4bcc2e6421d27a85a')
  'functions/gang/test/intel.test.js' = @('e75f18ab9ef2f6b71f3ccb2d8a38990745989bec', 'e437b6fe7acd75ed2cdbf571e269e9cefe829879')
  'functions/gang/test/market.test.js' = @('4919171c72f8a1f2a0a4614f06e9e5cf00ef4c73', 'e0379fe58705e2f39c5906c6ed6ff91eabe9f613')
  'functions/gang/test/membership.test.js' = @('2ace2c70516920f6625f9e0ad187e3ce519741a5', '21882912f900257f4e43e203989c5364b4b3ce58')
  'functions/gang/test/v1574.test.js' = @('3c2e55c1d943460846270d86a4855cb64faaf24a', '7aca2afa56434ac8e36e42a34b671d6f86618368')
  'functions/hq.js' = @('4a4daf70529213a3ddcfb6d5d4566a899446e089', '3e19b6270b48663683803a19c93d248f268cd5b8')
  'functions/jobs.js' = @('db598883e06396bfeb1f665862d05f8208cc635e', 'f26e2e8545ea70fad6ed8d08c46cc11c792832b2')
  'functions/package.json' = @('fbf3affc03f3839b3727e0b2920962a59b1f4c58', '94aa69bb2e9b4fd828f07d358108c5d95d7a2fd4')
  'functions/scripts/v146-hq.test.mjs' = @('cc89adf9f0969af05e39ba010e7862195ad6a64a', '733ff5512029478f2b3aaf4381babc950cc72d4b')
  'functions/scripts/v151-jobs.test.mjs' = @('6998cb6296c4f5c50d273cfff1de2fe64c86c13e', 'b41114218e4191f7ed71714b49021c3820c88eb3')
  'functions/scripts/v157-far-jobs.test.mjs' = @('8550708ea6866858f2a13d4424741aba366583ae')
  'functions/shop.js' = @('55d6c659ff31a7e1f3f42ba5b10efb4cf989ca60', 'c86193bffa2da2e8aa4a5013bed75de490165046')
  'functions/vehicleKinds.js' = @('4e4deaeba95aabc8c15e67ee384e21f5457b7597', '9266e2c737bb866bf6a5e7a007bffee54d6daa49', 'ebdc57049c92e81ae50ecd29b10024c2ad185c18')
  'functions/vehicleMods.js' = @('571b90706d4a905040f013adefdaf2476ebb51b1', '93bb216e38c653b9afdf48784224d341b83a85e9')
  'preview/mekan-app.jsx' = @('1b03b7b50b33493a964c0bff8c4a7faf650f5732', '07f3cf6f3df00e978a44d8a597103409c03b9756')
  'preview/mocks/firebase-firestore.js' = @('6f5cb0c54f4fe39cde589f7049c8926b3f808b1f', '1683790ed79e5275060fe504544c93f702613843')
  'public/manifest.json' = @('6a5fddbb32858f71a5fdbaa75530c6ce56e543ca', '3d881e5f19ff13e056401a151077f963488b2081')
  'src/App.jsx' = @('c39154bfe2e6c5d656b24d4e95d924cf65e1fbf6', '6b2642867359c1b03031e2891eca777ebe4fb9bd', '5b14cb8c52f670dd9eb3520e8bd9a291517d5c17', 'a6a4edd5c088386fb05c46e23d32c07d889427e9', '2b70b6a175c7ea2ad3a16bc892ff4dfdd790d98a', '252664d82a01fcfa1d284dfe39df93ff19dde9b9', '94e71785618fad69fe5e6385ac9a68d7d3437ee7')
  'src/components/BusinessHub/BusinessHub.jsx' = @('99ed397412a815847ea99346a8a4d601e18f7ebe', '711d0851410bbc5c2f04aaab7e79bae924e0f23b', '69e8e525d195caa71be0b8f4351653165284f3df')
  'src/components/City/City.css' = @('aeefd85b0a5a02d540f651c88c2d41e5de809119', 'b623e96b484f0f88b553dd1a5c2982e83c1f9724', '8dbd8ae92a274073d2a58e9ae1e2218adfaebf48', 'c17e22e5639480e806c3774ab6de6a68b2fae59c', '5ddc15e6c9045a2bb9b8a67301145a5d19b2b6c3', 'c310c8b7f94cbfac3570cd35b082b6040b2ee365')
  'src/components/City/CityBizList.jsx' = @('30218ca95eead28f039bfe08479ef6f8b74157c3')
  'src/components/City/CityHouseList.jsx' = @('d67e234c3b1869ec1a704b050c9442a2763f7b56')
  'src/components/City/CityPhoto.jsx' = @('72f6cce851eefccfd6486f61e255b5088be39471', '217ecabe6075297da0a38fe0ec42d2d8a183adaf', 'd4262c27591b906df8e546f7e363b2c87e171695')
  'src/components/City/CityScreen.jsx' = @('d7cc71ce723f683f47b02067e8bfe1d6e7393522', 'c6b31292b96ea6c2b4bfe7383f4baf6d36eb17fc', 'c4314b13c500614adad52512fbc5ad8ecdaf8a3d', '0c9705a1e545384765a2d7e8408fcd7b5805ac8a', '74e833681f7dfe9d26d3451c2721fc5c47b7ee75', 'c8d7de5c2b4249dddb20595ac22f29c2303e3320', 'f0874de952df569974c20e8eb1d8e1800f8c74d4', '3feb7fc1360e1c68054abb76b9bb99272a0c45ae')
  'src/components/City/HeistVideo.jsx' = @('e22a3d387c4055b26c194f4cf441be5adfa4ac36', '60e9c7c1274b6f964b6bc2d125d7851cc0af45a7')
  'src/components/City/areas.js' = @('a14a060a384d7b17325f0fda88e1d824865056ab', '4d14971bd719debb2b55bcc87be8d994898a33e6', 'b3192361b059135d804dd77b7c14511677725eca')
  'src/components/City/buildings.js' = @('dfee7aafc91e550c55f65d2b78b1d3b05e7526e2', '96af25fe392b90173d4b2d1e967537e85cbda492', '2ce914997dbcfa36f5bbde77e90ce85423d3e9d1', 'ca15bd71eb067736e4544e5c0b0de6ff5d6cafd5', '9c6a05378f037f58cf92446885eb6158924fba0d')
  'src/components/City/cityEngine.js' = @('5b1f1be577716756c960342c3b5f8e80421ecadd', '93053bc46f3b3cabb7ed077685c91612cc356a30', '17629177bb70059a75129355847310897aaa3aaf', '0124bb98556bbc28009fd3151572bcddfa9e0dd7', 'f2deadbc048fb9483663b61d1af00b7f568f35fb', '74b1d4ad44bd56af6ce24e603de1568fc740fe3a', '5aeba00ea0c7dcf9f80ff9e6a4eaf102033eadbf', '39bfc7ffed4d3dccf419612b3ed37ab2bb55421a', '8dc4aaa72235b6ffe088fd7f8c545655d57156bc', '505c0a12568f0b7f4009838358f287cf8777322f', '42f57d88f74dcc650f276651a1a84f3b3f50b010', '7c8bfaa69f1099762f3a702c384bd49ce438caa2')
  'src/components/City/cityHeist.css' = @('b1ee34241b98a0930ef8f50b84383a08f6f7b93d', '8b085f75af2e85b3a5ce69c417c5bd005862e248')
  'src/components/City/cityHeist.js' = @('5bd675ee8c827e6e975a9b0b71b0ca31d61cde9a', '6b45f803d7803c8684de057ddab2874f76164df9')
  'src/components/City/cityJobs.js' = @('019ac34ff55ea100aa59b6d3fbfa12225102a87c', 'f8bb8583701f59d7e8cf8d1eb0ee29bd9e572309')
  'src/components/City/cityLayout.js' = @('349361ab4e2062374fd885e419cd9ff9b59dbf86', '6bd0e920b30510462bfd48a2ca6777241269fab2', 'f781b2a64088cd77a623e9377b6009463ad71de6')
  'src/components/City/cityNet.js' = @('4fa95f88c1ded55bf67adc0fc876185528de90f8', '732c83f04b53539989441d604b631980d3e01e38')
  'src/components/City/cityPlan.js' = @('50ef39a57d181c67c6e03407f80eb5db9c856e74', 'a5db699dac47d3fb7a19f5f3345372a0fa55b074', '029d8a03abff23fe85c759193204a9e1f6172205', 'b2ee094cc299f7a0eb1160c3d9333ba5e82d1f07', '4a42e800b60a34bf8ebb39a0dab1f429e3cb9988')
  'src/components/City/coast.js' = @('a597c70cda7997578f758664cfe22d6ea4b68c99')
  'src/components/City/coastShape.js' = @('3382348418cc77ba14518a4cf867ee09978e51f2')
  'src/components/City/jobBuildings.js' = @('1774837880c6edb3f7d4a364e46e59924f363fea', 'b6facb60fc0884e9aaf24c0e4781093649b23a19')
  'src/components/City/kit.js' = @('147a381e297dc56beee6ec9d77ba3864de62853a', '76d74351244a5f02cb56b63f8d9f961f082edce2', '4e53c38d56b003ff78685ab6fdb3d52bdecca59b', 'f7c910de0b20906f2b4ee1e373a940d4d753aaa7')
  'src/components/City/vehicles.js' = @('15c4534a84617b8f96be1886470a15716293c87b', '4b7259b27e47c1835488f51525273e01184005dd', '837e6f88ce6dbb24ff782b7a1565f016aa45533a', 'ebf3bd241e3b44947a2eabbffef791e04058d33f')
  'src/components/City/world/animals.js' = @('91b50fc4a45817dd497f34ac0b66eb4f221ce27e')
  'src/components/City/world/layouts.js' = @('21593c1ab26bfdcfd689a1e5eedb85eafebfb9a8', '4119bf6e06447dc9adbaad38dcc28c84b5bb9c8b', '772309fab9b6e41befae62e2ac89d69537608264', 'df6f3db22c55ad8a8fde632d98116290480f9282')
  'src/components/City/world/map.js' = @('0ab9e9bcc6de0dc8b12f78c0b1af6be81ebed9c5', 'f6f7c68ae3a8222746a3c39d71d604c6a0e5f080')
  'src/components/City/world/newItems.js' = @('317c10c4996a88a90d4b3e8fa1fbffc7847c79dc')
  'src/components/City/world/northPark.js' = @('f837f7cac30ea8c3125255feb95a7703ffb957db')
  'src/components/City/world/otogar.js' = @('d274c726db7e435c23159d67d228396165c48db8')
  'src/components/City/world/outerWorld.js' = @('5010ac4a1c57e245654133a5547255e371870788', 'f2706fe6d709b9c65a1e9ba19917c3ce158a6fbb', 'a554fe6d89b468a8f285152993de45813407502f', '5dcfa518b37c47f80724b66a9baf66261e0e2ea3', '42f8fa55f9de76f4ed5a3a3d9e28ba055cffddd6', '271b95a0bc0afccebb39ab4ed4c1505824dc63bb')
  'src/components/City/world/roadside.js' = @('8dab3a0593eea810647c4ed3a5d24b639e88e5a9', '72be12c0650d4068117d4ed9ccdfbcf3158d02cc', '09620f1f3680801daeed12040e2efb03fe93e9b9', 'ce8623eff6af046dfbc38ccbc27363a362fbb8b3', '6ed3cc4318c2c08a628f65087bea27a22750dad3', 'dab87cf6c4af3a836ebfe6e1610b850b8a709986')
  'src/components/City/world/roadsideGeo.js' = @('499e2e6b4dd754344038fce34cc8eb9ea98a15c5', 'f3f97e3e0c4369ba028097bda0fa5fab644505ba', '8b131a0132643a556d8464d95cec5e25eed6453a')
  'src/components/City/world/route.js' = @('d6499814c4c68b5a96a4ff4a7effb32bc2c77c09')
  'src/components/City/world/town.js' = @('19a08912a85575aec3f8ecf43093b829586c1738', 'd1bf84698930545782c0609c278c566a229abba3')
  'src/components/City/world/venues.js' = @('e0bc5a6ee4cec474b68b4ac0526ffd535bcea03e', 'a472aaebefb17a079b819a19de490da73eaf9443', 'c4035bfbd993401dadb90000748543834ee68cf1', '796ad72b51ca2ec97fe61c1d98bcbd9a41705ca4', '63549acf55f4825d23844cfa05d05112cd3721c5', 'ad4364cf25ff9e76f0bbae071dfe4f82720524f6', 'a6abdc1f28fb581d4cc8548a00c981c295e2b570')
  'src/components/City/world/world.js' = @('fbaac88f8c07cc373d7fccd6b4e6afb4233fade7', 'ad1c9bf7249daa1e8e6ff8776821fcd84fcc06c3')
  'src/components/Gangs/GangShell.jsx' = @('3819bbca1e124fbbf770064b313e96d5c8f9235b', '88929c1ff813c5e47dbe78926f54d86060023060', '6c00987764d7d1add5a262454119cea8418ba718')
  'src/components/Gangs/Gangs.css' = @('377079562e15e16e6241083a3c4628eebdbbb168', '96dcc5416c726519caeb8c88c167a8ab6b6464bc')
  'src/components/Gangs/GangsFullScreen.jsx' = @('cc543ba7bcd5f2f0fe5d3a686b96eae97b916674', '205354bbd2fa93a52e8c600b7a05ed1043b43cb8')
  'src/components/Gangs/OrgPanelSheet.jsx' = @('d94657361c0809e3b7279475fc52a217fedfb851', '43872e83a48c574dd588754503e6835adf3a8e9f', 'f5ed40b324585b89239b4588daef2f96ccd821d6')
  'src/components/Gangs/WatchWars.jsx' = @('9a0312b771893824c44544051a8e8b0ac948b35d', 'c133d0a45cd27756f2b6c1db61dde4a72d30f59a')
  'src/components/Gangs/alerts.jsx' = @('813655c766a8f660c39265130a9b9412d742e421', '8be0473ba572467d5e8ad39e6ab8621c2f82d051')
  'src/components/Gangs/cityHqNav.js' = @('d330fa0dfc309787b16924d0b5840f34c2cea972')
  'src/components/Gangs/shared.jsx' = @('e9eeab33c1e6d28b5274028516848135b79b7aee', 'ab5971c33afb368a67eacc9ceebea63eb83e27f8')
  'src/components/Gangs/tabs/ListTab.jsx' = @('99dd80dbed1b3108f2398e15edf8bea891bf8c35', 'a062cbc36d5c1f867ad9eb94a2382f0fb4adee9a')
  'src/components/HomeOffice/OfficePanel.jsx' = @('d9932868c481c1cf4ccef014875da129f0f13f47', '5c6a704234c3289869af24d246a18c8f67e4a998')
  'src/components/HomeScreen/HomeScreen.css' = @('1e5867322e31701613a00fe251b46d472ab57752', '1e1d4a8ec7fb03f775399fd3c5439028df45c57b')
  'src/components/HomeScreen/HomeScreen.jsx' = @('3e6cc127869a7fd6e4a4a5ceb921e4b3c92484b8', 'afe5ebcd6f16128d76877a6e45d6ce70d07d0e48')
  'src/components/HouseScreen/HouseHub.jsx' = @('a9b5d27c8ea38ad40e0d13a20e5e0329a131b55b', 'ff07f05c997a263df39c8ca3c64f95e624e58402')
  'src/components/HouseScreen/HousePhoto.jsx' = @('8eb43c42b24cd60e24e3fd62d5a9e63f957a8fcc', '0754b1175436e6fb31ac5150aefcdac7656d426b')
  'src/components/HouseScreen/HouseScreen.css' = @('be71882cf8f4e603bb6bbb1a8aebd0cba910ad41', '0e305ce6cfc337330cfd77a4239c529f8506bf5e')
  'src/components/HouseScreen/houseCatalog.js' = @('342aca77b461825278cdb41536b605ab21c8aa85', '9873a5f6c8c5e4947959430d44c1f94f999ee798', '5e08cf50103c970ddad815f74fd4a2112a612a1c')
  'src/components/HouseScreen/houseCatalogPets.js' = @('ce940338b85504070a9cd6b420c67fe7ae9143cf', 'c686e0eed8d006dd584e48f98906adc562f14638')
  'src/components/HouseScreen/houseCatalogV135.js' = @('355e14b76acbfc2614497bd816193373bef2b139', '196e84644ff5421d42e11bec417557e7fd617d9c')
  'src/components/HouseScreen/houseCatalogV145.js' = @('e9b7d76d111e0d06f6036d38575ddf0cd388a892', 'c16d63be3bc8bd3bdf5c095197258a4e4f68e1aa')
  'src/components/HouseScreen/houseCatalogV146.js' = @('4bcc6b359ac5215e653f3b246050e2781ebc1f4e', '79f093103edfadd3748c5648661859a8fc60a156')
  'src/components/HouseScreen/houseCatalogV92.js' = @('5c2e802d3b0250d8a10cb989e5148350cc4925d7', '84e129f69a8f954b928977a590717a1eed8ee7fe')
  'src/components/HouseScreen/houseEngine.js' = @('210fef42df2fcea4ab23c5e5209ec15151afd826', '7aafb359f0cf75a72966d166f15a10dd7c93f7e3')
  'src/components/HouseScreen/houseTextures.js' = @('bb4b89dcccb35006ccd0d9afc0632959ce61e6d4', '2bd5042c1f0dc849f8a53a5cae9cc201fc01717b')
  'src/components/MekanlarScreen/MekanlarScreen.css' = @('4dc9da7f7a28eb3bab253ccf6b36b5634185c867', '0d430462e50a221293c3f9584d07241ec264fb62')
  'src/components/MekanlarScreen/MekanlarScreen.jsx' = @('9d002a2769a3f5ce0b6dad6edb8a1854ca8abbe2', '786de1ff536ee9403326703950228f0bbc420b62')
  'src/components/MekanlarScreen/SoygunTab.jsx' = @('992eb423ab43ac0ad2b9b8742ee77dbfb83118f8', 'ca82cb981c8c201c246ea79d9156887824709ddd', '5615825610e8c8299ef537785687b43d60e994e9')
  'src/components/MekanlarScreen/VisitTab.jsx' = @('8256b3210f3e4ab963cd4a93079cf781c4caa021', '35d04941cfbd2cebfce3e99b088b54265a5b5320', 'ece9c449e14409fd687d4fd0f2d55d59cf835a8f')
  'src/components/NearbyPlayers/NearbyPlayersButton.jsx' = @('d3a627aa52afc7796bc305115bcdbb849e650245', 'e331dc1d9b2b83ed827daf47f13c0dacd8924612')
  'src/components/OnboardingPanel/OnboardingPanel.css' = @('9f8fae26d911b62797ed5bc0e179c85e6f90924e', 'f16d2d31f14f562085da5a7b376544947ec24d5c')
  'src/components/OnboardingPanel/OnboardingPanel.jsx' = @('7c77a1c7edfd862b66faad4a024503adee82f27b', 'f1aef1052c4321ee9fdeb6133313ce12aa3273eb', '505cb5889e0b09fed5a59d0b970d36688b723c6b')
  'src/components/Politics/Politics.css' = @('af1ab33b3ead42aefa816ad83e0248c5d9ae376b', '0aa6b5312483f2402aa720fa5624a0815c1d1b66')
  'src/components/Politics/PoliticsHomeButton.jsx' = @('fe7e286635ad309350e03e89a65e296556b2ff3c', 'c3bc9b982cc3fd179d9b1544dae6e128dc34465b', '4dd1af398c54126bdf7931dc3e377273127c89b7')
  'src/components/Sixtagram/SixStories.jsx' = @('57f0d02b4109a7dadd0d73b457147d36f5b51809', 'ac71185cc9220c92c39e668d18c3e9e87f333e6a')
  'src/components/Sixtagram/SixtagramScreen.css' = @('e41b59b3411e092311370c110864d07aba0b3720', '3930909a15818095513d1311dd91bad88757c576')
  'src/components/Sixtagram/SixtagramScreen.jsx' = @('79672d0d0ebf6acc70447fd22be62715a91de294', '1e6865f1f2e920fa1305d1d71866840878aff4f4')
  'src/components/Stream/LiveStreamsButton.jsx' = @('78046edd8d077706da264393177a34048b1f1118', 'fb46b34f177493a6731cdc0eb0fdd4d13b96c3d4')
  'src/components/Stream/Stream.css' = @('0a21400b774c14e895b5427ac4ed8aa294015bb0', 'c47bed7a62014ecd19b2288935e9d21b8bb4c884')
  'src/components/UpdateAppBanner/UpdateAppBanner.css' = @('4b5ad5fa295d9237d4f784cc95fadd32ef037230', '1ac12417104a510b4b392328e67873859c324053')
  'src/components/Venue3D/venueParts.jsx' = @('c4d784bb1e10f9fa6d35b01306378d8555d9fa04', '3031f51fba1b88e3a962d5a9583737d6e0a3df8a')
  'src/data/vehicleCatalog.js' = @('524b3bb3b52f8ae3b40640bab4d6569faee531d6', '855343c4871faa647901f9d056338f0014630eef')
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

$tmp = Join-Path $env:TEMP 'neon-v157-9-zip'
Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
try { Expand-Archive -Path $zip -DestinationPath $tmp -Force -ErrorAction Stop } catch { Dur "Zip acilamadi: $($_.Exception.Message)" }
Write-Host ""
Write-Host "===== dosyalar yerlestiriliyor =====" -ForegroundColor Cyan
try { Copy-Item -Path (Join-Path $tmp '*') -Destination $PSScriptRoot -Recurse -Force -ErrorAction Stop } catch { Dur "Dosyalar kopyalanamadi: $($_.Exception.Message)" }
Write-Host "Tamam." -ForegroundColor Green

# Android: telefon yan cevrilince uygulama da doner (iPhone'daki gibi). Kendi ayarlarin korunur.
$man = 'android-webview\app\src\main\AndroidManifest.xml'
$androidDegisti = $false
if (Test-Path $man) {
  $m = [IO.File]::ReadAllText((Resolve-Path $man))
  if ($m -match 'android:screenOrientation="portrait"') {
    $m = $m -replace 'android:screenOrientation="portrait"', 'android:screenOrientation="fullUser"'
    [IO.File]::WriteAllText((Resolve-Path $man), $m, (New-Object System.Text.UTF8Encoding($false)))
    $androidDegisti = $true
    Write-Host "Android: yatay ekran izni eklendi." -ForegroundColor Green
  }
}
$gradle = 'android-webview\app\build.gradle.kts'
if ($androidDegisti -and (Test-Path $gradle)) {
  $g = [IO.File]::ReadAllText((Resolve-Path $gradle))
  $mc = [regex]::Match($g, 'versionCode\s*=\s*(\d+)')
  if ($mc.Success -and [int]$mc.Groups[1].Value -lt 17) {
    $g = [regex]::Replace($g, 'versionCode\s*=\s*\d+', 'versionCode = 17')
    $g = [regex]::Replace($g, 'versionName\s*=\s*"[^"]*"', 'versionName = "1.2.2"')
    [IO.File]::WriteAllText((Resolve-Path $gradle), $g, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "Android: surum 17 / 1.2.2" -ForegroundColor Green
  }
}

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

foreach ($fn in @('gangAction', 'cronTick', 'houseAction', 'shopAction', 'cityAction')) {
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
$ekle = @('functions/houseCatalogData.js', 'database.rules.json', 'functions/cityJobsData.js', 'functions/cityPhoto.js', 'functions/gang/actions/intel.js', 'functions/gang/actions/membership.js', 'functions/gang/clock.js', 'functions/gang/core.js', 'functions/gang/test/betintel.test.js', 'functions/gang/test/clock.test.js', 'functions/gang/test/exploits.test.js', 'functions/gang/test/harness.js', 'functions/gang/test/intel.test.js', 'functions/gang/test/market.test.js', 'functions/gang/test/membership.test.js', 'functions/gang/test/v1574.test.js', 'functions/hq.js', 'functions/jobs.js', 'functions/package.json', 'functions/scripts/v146-hq.test.mjs', 'functions/scripts/v151-jobs.test.mjs', 'functions/scripts/v157-far-jobs.test.mjs', 'functions/shop.js', 'functions/vehicleKinds.js', 'preview/mekan-app.jsx', 'preview/mocks/firebase-firestore.js', 'public/manifest.json', 'src/App.jsx', 'src/components/BusinessHub/BusinessHub.jsx', 'src/components/City/City.css', 'src/components/City/CityBizList.jsx', 'src/components/City/CityPhoto.jsx', 'src/components/City/CityScreen.jsx', 'src/components/City/HeistVideo.jsx', 'src/components/City/areas.js', 'src/components/City/buildings.js', 'src/components/City/cityEngine.js', 'src/components/City/cityHeist.css', 'src/components/City/cityHeist.js', 'src/components/City/cityJobs.js', 'src/components/City/cityLayout.js', 'src/components/City/cityNet.js', 'src/components/City/cityPlan.js', 'src/components/City/coast.js', 'src/components/City/coastShape.js', 'src/components/City/jobBuildings.js', 'src/components/City/kit.js', 'src/components/City/vehicles.js', 'src/components/City/world/animals.js', 'src/components/City/world/layouts.js', 'src/components/City/world/map.js', 'src/components/City/world/newItems.js', 'src/components/City/world/northPark.js', 'src/components/City/world/otogar.js', 'src/components/City/world/outerWorld.js', 'src/components/City/world/roadside.js', 'src/components/City/world/roadsideGeo.js', 'src/components/City/world/route.js', 'src/components/City/world/town.js', 'src/components/City/world/venues.js', 'src/components/City/world/world.js', 'src/components/Gangs/GangShell.jsx', 'src/components/Gangs/GangsFullScreen.jsx', 'src/components/Gangs/OrgPanelSheet.jsx', 'src/components/Gangs/WatchWars.jsx', 'src/components/Gangs/alerts.jsx', 'src/components/Gangs/cityHqNav.js', 'src/components/Gangs/shared.jsx', 'src/components/Gangs/tabs/ListTab.jsx', 'src/components/HomeOffice/OfficePanel.jsx', 'src/components/HomeScreen/HomeScreen.css', 'src/components/HomeScreen/HomeScreen.jsx', 'src/components/HouseScreen/HouseHub.jsx', 'src/components/HouseScreen/HousePhoto.jsx', 'src/components/HouseScreen/HouseScreen.css', 'src/components/HouseScreen/houseCatalog.js', 'src/components/HouseScreen/houseCatalogPets.js', 'src/components/HouseScreen/houseCatalogV135.js', 'src/components/HouseScreen/houseCatalogV145.js', 'src/components/HouseScreen/houseCatalogV146.js', 'src/components/HouseScreen/houseCatalogV92.js', 'src/components/HouseScreen/houseEngine.js', 'src/components/HouseScreen/houseTextures.js', 'src/components/MekanlarScreen/MekanlarScreen.css', 'src/components/MekanlarScreen/MekanlarScreen.jsx', 'src/components/MekanlarScreen/SoygunTab.jsx', 'src/components/MekanlarScreen/VisitTab.jsx', 'src/components/OnboardingPanel/OnboardingPanel.css', 'src/components/OnboardingPanel/OnboardingPanel.jsx', 'src/components/Politics/Politics.css', 'src/components/Politics/PoliticsHomeButton.jsx', 'src/components/Sixtagram/SixStories.jsx', 'src/components/Sixtagram/SixtagramScreen.css', 'src/components/Sixtagram/SixtagramScreen.jsx', 'src/components/Stream/Stream.css', 'src/components/UpdateAppBanner/UpdateAppBanner.css', 'src/components/Venue3D/venueParts.jsx', 'functions/catalogData.js', 'functions/vehicleMods.js', 'src/data/vehicleCatalog.js', 'src/components/City/CityHouseList.jsx', 'src/components/Gangs/Gangs.css', 'src/components/NearbyPlayers/NearbyPlayersButton.jsx', 'src/components/Stream/LiveStreamsButton.jsx', 'V157-9-DEGISIKLIKLER.md', 'deploy-v157-9.ps1', 'android-webview/app/src/main/AndroidManifest.xml', 'android-webview/app/build.gradle.kts') | Where-Object { Test-Path $_ }
git add -- $ekle
$gizli = git diff --cached --name-only | Select-String -Pattern '(keystore\.properties$|\.keystore$|\.jks$|local\.properties$|\.aab$|\.apk$|\.env$)'
if ($gizli) { git reset -q; Dur "Gizli/derleme dosyasi commit'e girecekti: $gizli -> commit YAPILMADI." }
git commit -q -m "v157.9: karargahta cete dugmesi + baska ceteye profil (kidemli kadro, 00:00 kasa), cete paneli acilir-kapanir, Kara Sahinler, Duzenle / ev / isletme acilirken sehir kapanmaz (hizli, bellek), telefonda geometri inceltme, otobus ici zemin, kofteci pist kaldirimi, simitci blogu mustakil, satici tabelalari kalkti, fici masa 20.000 altin, ofis koltuklari, karargah girisleri, gise gorunmez duvar, yatay mod, alt cubuk acilir pencereleri ortmez (+ v157.9/.7/.6/.5/.4)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_0182eo1K7a8WiqJvJnxUChNu"
if ($LASTEXITCODE -ne 0) { Dur "git commit basarisiz (degisiklik yok ya da git hatasi). Ciktiyi Claude'a gonder." }
git push
if ($LASTEXITCODE -ne 0) { Dur "git push basarisiz. Ciktiyi Claude'a gonder." }
Write-Host ""
Write-Host "TAMAM: v157.9 gonderildi. Cloudflare birkac dakika icinde yayinlar." -ForegroundColor Green
if ($androidDegisti) { Write-Host "ANDROID: yatay ekran icin uygulamayi (surum 17) yeniden derleyip Play'e yuklemen gerekiyor." -ForegroundColor Yellow }
