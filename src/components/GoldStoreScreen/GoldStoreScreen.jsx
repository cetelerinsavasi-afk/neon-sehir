import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { createGoldStoreOrder } from '../../services/gameActions';
import './GoldStoreScreen.css';

// Bu paket listesi SADECE görsel amaçlı — gerçek fiyat/miktarlar
// functions/index.js > GOLD_STORE_PACKAGES içinde, sunucu tarafında
// tanımlı. İkisini değiştirirsen ikisini de güncellemeyi unutma.
const PACKAGES = [
  {
    id: 'paket1',
    title: '20.000 Altın',
    priceLabel: '30 TL',
    emoji: null, // 🪙 yerine .gold-coin-icon (bkz. aşağı) — bazı platformlarda emoji görünmüyor
    lines: ['20.000 Altın'],
  },
  {
    id: 'paket2',
    title: '60.000 Altın + Özel Paket',
    priceLabel: '100 TL',
    emoji: '💎',
    lines: [
      '60.000 Altın',
      '4 Yasaklı Madde',
      '1.000 Tamir Malzemesi',
      '100 Silah Geliştirme Malzemesi',
      '20 Araba Geliştirme Malzemesi',
    ],
  },
];

// submitShopierForm — Shopier'in ödeme sayfasına tam sayfa yönlendirmek
// için görünmez bir <form> oluşturup POST eder. Shopier kart bilgilerini
// KENDİ sayfasında alır; bu form asla kart bilgisi taşımaz.
function submitShopierForm(actionUrl, fields) {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = actionUrl;
  form.style.display = 'none';
  Object.entries(fields).forEach(([key, value]) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = key;
    input.value = value ?? '';
    form.appendChild(input);
  });
  document.body.appendChild(form);
  form.submit();
}

// useGoldOrderResult — sayfa Shopier'den ?goldOrder=<id> ile geri
// döndüğünde o siparişin canlı durumunu izler. Gerçek teslimat webhook
// üzerinden (sunucu tarafında) zaten yapılmış olur; bu sadece kullanıcıya
// "ödemen alındı, altının yüklendi" bilgisini göstermek için.
function useGoldOrderResult() {
  const { user } = useAuth();
  const [orderId, setOrderId] = useState(() =>
    new URLSearchParams(window.location.search).get('goldOrder')
  );
  const [order, setOrder] = useState(null);

  useEffect(() => {
    if (!orderId || !user) return undefined;
    const ref = doc(db, 'goldStoreOrders', orderId);
    const unsubscribe = onSnapshot(ref, (snap) => {
      setOrder(snap.exists() ? snap.data() : null);
    });
    return unsubscribe;
  }, [orderId, user]);

  const clear = () => {
    setOrderId(null);
    setOrder(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('goldOrder');
    window.history.replaceState({}, '', url.toString());
  };

  return { orderId, order, clear };
}

export default function GoldStoreScreen() {
  const { user } = useAuth();
  const [buyingId, setBuyingId] = useState(null);
  const [error, setError] = useState('');
  const { orderId, order, clear } = useGoldOrderResult();

  const handleBuy = async (packageId) => {
    if (!user) {
      setError('Satın almak için önce giriş yapmalısın.');
      return;
    }
    setError('');
    setBuyingId(packageId);
    try {
      const result = await createGoldStoreOrder(packageId);
      const { actionUrl, fields } = result.data;
      submitShopierForm(actionUrl, fields);
      // submitShopierForm sayfayı Shopier'e yönlendirir; buradan sonrası
      // çalışmaz (sayfa terk edilir), ama hata olursa diye buyingId'yi
      // aşağıdaki finally ile de sıfırlıyoruz.
    } catch (err) {
      console.error('Altın mağazası satın alma hatası:', err);
      setError(err.message || 'Satın alma başlatılamadı, tekrar dene.');
      setBuyingId(null);
    }
  };

  if (orderId) {
    return (
      <div className="gold-store">
        <div className="gold-store-result">
          {!order && <p>Sipariş durumu kontrol ediliyor…</p>}
          {order?.status === 'pending' && (
            <p>
              Ödemen işleniyor. Shopier onayı geldiğinde altının otomatik olarak hesabına
              yüklenecek (genelde birkaç saniye sürer).
            </p>
          )}
          {order?.status === 'paid' && (
            <p className="gold-store-success">
              ✅ Ödemen alındı! Altının ve varsa paket eşyaların hesabına yüklendi.
            </p>
          )}
          {order?.status === 'failed' && (
            <p className="gold-store-warn">Ödeme tamamlanamadı. Altın yüklenmedi.</p>
          )}
          <button className="gold-store-btn gold-store-btn-secondary" onClick={clear}>
            Mağazaya Dön
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="gold-store">
      <p className="gold-store-hint">
        Ödemeler Shopier üzerinden güvenle alınır — kart bilgilerin bize hiçbir zaman ulaşmaz.
        İstediğin kadar satın alabilirsin.
      </p>
      {error && <p className="gold-store-error">{error}</p>}
      <div className="gold-store-list">
        {PACKAGES.map((pack) => {
          return (
            <div key={pack.id} className="gold-store-card">
              <div className="gold-store-card-head">
                <span className="gold-store-emoji">
                  {pack.emoji || <span className="gold-coin-icon" style={{ width: 28, height: 28 }} />}
                </span>
                <div>
                  <p className="gold-store-title">{pack.title}</p>
                  <p className="gold-store-price">{pack.priceLabel}</p>
                </div>
              </div>
              <ul className="gold-store-lines">
                {pack.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <button
                className="gold-store-btn"
                disabled={buyingId === pack.id}
                onClick={() => handleBuy(pack.id)}
              >
                {buyingId === pack.id ? 'Yönlendiriliyor…' : 'Satın Al'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
