// factoryHelpers — FactoryScreen.jsx ve hisse (stok) modallarının (bkz.
// FactoryShareBuyModal.jsx) PAYLAŞTIĞI saf yardımcı fonksiyonlar. Ayrı bir
// dosyada tutuluyor ki bileşen dosyaları sadece bileşen export etsin (React
// Fast Refresh, bileşen-dışı export'ları aynı dosyada görünce devre dışı
// kalıyor).

// factoryDisplayName — özel isim verilmemiş fabrikalar için değişmeyen
// "{ownerName}'in Fabrikası" varsayılanı (bkz. functions/index.js
// setFactoryName — alan hiç ayarlanmamışsa Firestore'da `name` yok).
export function factoryDisplayName(f) {
  return f?.name || `${f?.ownerName || 'Oyuncu'}'in Fabrikası`;
}

const FACTORY_CREATE_COST = 100000;
const MACHINE_PRICES = { tamirMalzemesi: 100000, silahUpgrade: 50000, arabaGelistirme: 50000, yasakliMadde: 100000 };

// miningFleetValue — bir fabrikadaki TÜM mining makinelerinin GÜNCEL
// (canlı kripto fiyatına göre) toplam değeri. Kademeli fiyatlandırma
// yüzünden tek bir makinenin fiyatı sahip olunan miktara göre artıyor, bu
// yüzden N × (şu anki tekil fiyat) YANLIŞ olur — birden fazla 100'lük
// dilime yayılan filoları yanlış değerlendirir. Doğrusu: 0..N-1 arasındaki
// her makinenin KENDİ diliminin fiyatını toplamak. Aynı dilimdeki
// makinelerin fiyatı birbirine eşit olduğundan tam dilimler kapalı-
// formülle, yarım kalan son dilim de tek çarpımla hesaplanır (bkz.
// functions/index.js içindeki sunucu tarafı ikizi miningFleetValue —
// mantık birebir aynı).
// DÜZELTME (madde 2, kullanıcı revizesi): dilim boyutu 100 → 10, dilim
// başı artış 2x → 0.2x (bkz. functions/index.js'teki AYNI değişiklik).
function miningFleetValue(count, cryptoPrice) {
  const n = count || 0;
  const price = cryptoPrice || 0;
  if (n <= 0) return 0;
  const TIER_SIZE = 10;
  const TIER_STEP = 0.2;
  const fullTiers = Math.floor(n / TIER_SIZE);
  const remainder = n % TIER_SIZE;
  let total = 0;
  for (let tier = 0; tier < fullTiers; tier++) {
    const unitPrice = Math.ceil((2 + TIER_STEP * tier) * price);
    total += TIER_SIZE * unitPrice;
  }
  if (remainder > 0) {
    const unitPrice = Math.ceil((2 + TIER_STEP * fullTiers) * price);
    total += remainder * unitPrice;
  }
  return total;
}

// computeFactoryValue — bir fabrikanın GÜNCEL parasal değeri: 100.000
// altınlık kuruluş ücreti + sabit fiyatlı makinelerin toplam fiyatı +
// mining makinelerinin kademeli filo değeri. `machines` — fabrikanın
// makine dokümanlarının dizisi (her biri `type` alanına sahip). Bu değer
// sadece bilgi amaçlıdır (Fabrikalar sekmesinde/hisse panelinde
// gösterilir), hiçbir para transferi/işlem bu sayıya dayanmaz — bkz.
// functions/index.js içindeki sunucu tarafı ikizi computeFactoryValue.
export function computeFactoryValue(machines, cryptoPrice) {
  let value = FACTORY_CREATE_COST;
  let miningCount = 0;
  for (const m of machines || []) {
    if (m.type === 'mining') {
      miningCount += 1;
    } else {
      value += MACHINE_PRICES[m.type] || 0;
    }
  }
  value += miningFleetValue(miningCount, cryptoPrice);
  return value;
}
