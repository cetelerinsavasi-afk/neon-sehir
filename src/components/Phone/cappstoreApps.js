import { useCallback, useEffect, useRef, useState } from 'react';

// =============================================================================
// v161 — CAPPSTORE: telefona indirilen uygulamalar
//   • Dock (SMS · ChatsApp · 2. El · Sixtagram) sabit: silinmez, taşınmaz.
//   • Ana ekranda Cappstore ikonu sabit; indirilen uygulamalar yanına eklenir.
//     Basılı tutunca düzenleme modu: sürükleyerek yer değiştir, "−" ile sil.
//   • Belediye uygulamasını sadece belediyede görevi olan (users.belediyeSeat)
//     indirebilir; görevden çıkınca telefon açıldığında otomatik silinir.
//   • Kurulu uygulamalar bu cihazda saklanır (localStorage, oyuncuya göre).
//     İlk açılışta Parara kurulu gelir (eskiden dock'taydı, kimse bankasız kalmasın).
// =============================================================================
export const STORE_APPS = [
  {
    id: 'parara',
    name: 'Parara',
    title: 'Parara Bank',
    sub: 'Banka ve para transferi',
    cat: 'Finans',
    size: '14 MB',
    desc: 'Altınını gönder, iste, hesap hareketlerini takip et. Telefonda hazır gelen Parara Bank artık Cappstore’da; istediğin zaman indirip silebilirsin.',
    feats: ['Para gönderme ve isteme', 'Tüm hesap hareketleri tek listede', 'Kredi ve yatırımlar'],
  },
  {
    id: 'borsa',
    name: 'Neon Borsa',
    title: 'Neon Borsa',
    sub: 'Mekân hisseleri',
    cat: 'Finans',
    size: '12 MB',
    desc: 'Seyyar satıcıların hisselerini al, sat. Mekânların günlük gelirinden payına düşen altın her gece hesabına birikir; istediğin zaman topla.',
    feats: ['Hisse al-sat, saatlik fiyat grafiği', 'Her gece gelir payı', 'Mekân mekân gelir detayı'],
  },
  {
    id: 'fabrika',
    name: 'Fabrika',
    title: 'Fabrika',
    sub: 'Fabrika paneli cebinde',
    cat: 'İş',
    size: '22 MB',
    desc: 'Fabrikaya gitmeden fabrika panelini açar: fabrikada “Fabrika” butonuna basınca çıkan panelin aynısı.',
    feats: ['Fabrikadaki panelin aynısı', 'Makineler, maaş ve üretim', 'Günlük gelir-gider raporu'],
  },
  {
    id: 'isletme',
    name: 'İşletme',
    title: 'İşletmelerim',
    sub: 'Tüm işletmelerin tek listede',
    cat: 'İş',
    size: '19 MB',
    desc: 'Sahip olduğun her işletme bugünkü kazancıyla listelenir. Birine dokununca o işletmenin ayarlar menüsü (fiyatlar, envanter, günlük rapor) açılır.',
    feats: ['Bugünkü kazanç ve müşteri sayısı', 'Fiyatlar, envanter, günlük rapor', 'Dünkü kazanç sıralaması'],
  },
  {
    id: 'futbol',
    name: 'Futbol',
    title: 'Futbol',
    sub: 'Stadyum futbol paneli',
    cat: 'Spor',
    size: '25 MB',
    desc: 'Stadyumdaki futbol paneli artık telefonunda. Takımını yönet, maçları ve ligleri takip et.',
    feats: ['Stadyumdaki panelin aynısı', 'Kadro, transfer, antrenman', 'Ligler, kupa ve iddaa'],
  },
  {
    id: 'belediye',
    name: 'Belediye',
    title: 'Belediye',
    sub: 'Belediye personeline özel',
    cat: 'Kamu',
    size: '17 MB',
    staff: true,
    desc: 'Belediyede görevi olanlara özel: belediye paneli cebinde. Görevden ayrılırsan uygulama telefonundan otomatik kaldırılır.',
    feats: ['Rapor, sohbet, bakanlıklar', 'Borçlar ve başkanlık', 'Şikâyetler'],
  },
];
export const STORE_BY_ID = Object.fromEntries(STORE_APPS.map((a) => [a.id, a]));
const STORE_IDS = STORE_APPS.map((a) => a.id);
const KEY = (uid) => `neon-phone-apps-v1:${uid || 'guest'}`;
const DEFAULT_APPS = ['parara'];

function load(uid) {
  try {
    const r = JSON.parse(window.localStorage.getItem(KEY(uid)) || 'null');
    if (r && Array.isArray(r.order)) return r.order.filter((id) => STORE_IDS.includes(id));
  } catch {
    /* yoksay */
  }
  return null;
}
function save(uid, order) {
  try {
    window.localStorage.setItem(KEY(uid), JSON.stringify({ order }));
  } catch {
    /* yoksay */
  }
}

// order: ana ekrandaki sıra (sadece kurulu olanlar) · staff: belediyede görevli mi
// playerReady: oyuncu belgesi yüklendi mi (yüklenmeden görevli değil sanıp silmesin)
export function usePhoneApps(uid, { staff = false, playerReady = false } = {}) {
  const [order, setOrderState] = useState(() => load(uid) || DEFAULT_APPS);
  const [downloading, setDownloading] = useState({}); // id → 0..100
  const [notice, setNotice] = useState(null); // { app, title, body }
  const timers = useRef({});
  const orderRef = useRef(order);
  orderRef.current = order;

  useEffect(() => {
    setOrderState(load(uid) || DEFAULT_APPS);
  }, [uid]);
  const setOrder = useCallback(
    (next) => {
      setOrderState((cur) => {
        const v = typeof next === 'function' ? next(cur) : next;
        save(uid, v);
        return v;
      });
    },
    [uid]
  );

  // görevden çıkan oyuncunun Belediye uygulaması otomatik silinir
  useEffect(() => {
    if (!playerReady || staff) return;
    if (orderRef.current.includes('belediye')) {
      setOrder((o) => o.filter((x) => x !== 'belediye'));
      setNotice({ app: 'belediye', title: 'Belediyedeki görevin sona erdi', body: 'Belediye uygulaması telefonundan otomatik olarak kaldırıldı.' });
    }
    setDownloading((d) => {
      if (d.belediye == null) return d;
      const n = { ...d };
      delete n.belediye;
      clearInterval(timers.current.belediye);
      return n;
    });
  }, [playerReady, staff, setOrder]);

  useEffect(
    () => () => {
      Object.values(timers.current).forEach(clearInterval);
    },
    []
  );

  const install = useCallback(
    (id) => {
      if (!STORE_BY_ID[id] || orderRef.current.includes(id) || timers.current[id]) return false;
      if (STORE_BY_ID[id].staff && !staff) return false;
      setDownloading((d) => ({ ...d, [id]: 0 }));
      let p = 0;
      timers.current[id] = setInterval(() => {
        p = Math.min(100, p + 7 + Math.random() * 10);
        if (p < 100) {
          setDownloading((d) => (d[id] == null ? d : { ...d, [id]: p }));
          return;
        }
        clearInterval(timers.current[id]);
        delete timers.current[id];
        setDownloading((d) => {
          const n = { ...d };
          delete n[id];
          return n;
        });
        setOrder((o) => (o.includes(id) ? o : [...o, id]));
        setNotice({ app: id, title: `${STORE_BY_ID[id].name} yüklendi`, body: 'Ana ekrana eklendi. Basılı tutarak taşıyabilir ya da silebilirsin.' });
      }, 120);
      return true;
    },
    [staff, setOrder]
  );
  const cancel = useCallback((id) => {
    clearInterval(timers.current[id]);
    delete timers.current[id];
    setDownloading((d) => {
      const n = { ...d };
      delete n[id];
      return n;
    });
  }, []);
  const remove = useCallback((id) => setOrder((o) => o.filter((x) => x !== id)), [setOrder]);

  return { order, setOrder, downloading, install, cancel, remove, notice, clearNotice: () => setNotice(null), setNotice };
}
