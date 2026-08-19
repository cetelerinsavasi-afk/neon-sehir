import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { getMyRedemptionCode } from '../../services/gameActions';
import paket1Image from '../../assets/goldStore/paket1.jpg';
import paket2Image from '../../assets/goldStore/paket2.jpg';
import './GoldStoreScreen.css';

// Bu paket listesi SADECE görsel amaçlı — gerçek fiyat/miktarlar
// functions/index.js > GOLD_STORE_PACKAGES içinde, sunucu tarafında
// tanımlı. Buradaki `shopierUrl` alanı, Shopier Dükkan'da bu paket için
// oluşturulan gerçek ürün linki. Yeni paket eklersen/link değişirse
// SHOPIER_PRODUCT_TO_PACKAGE'ı (functions/index.js) da güncellemeyi
// unutma — ürün ID'si (linkin sonundaki sayı) oradan eşleniyor.
// Yeni istek: "altın mağazasındaki paketin olduğu yere direkt mağazaymış
// gibi attığım görselleri yerleştirelim" — kartın üst kısmı artık ikon+
// başlık yerine doğrudan bu tanıtım görseli (image), asıl satın alma
// butonu (gold-store-btn) görselin ALTINDA gerçek/tıklanabilir buton
// olarak aynen kalıyor.
const PACKAGES = [
  {
    id: 'paket1',
    title: 'Başlangıç Paketi',
    priceLabel: '30 TL',
    image: paket1Image,
    lines: ['30.000 Altın'],
    shopierUrl: 'https://www.shopier.com/cetelerinsavasi/49730536',
  },
  {
    id: 'paket2',
    title: '100.000 Altın + Özel Paket',
    priceLabel: '100 TL',
    image: paket2Image,
    lines: [
      '100.000 Altın',
      '4 Yasaklı Madde',
      '1.000 Tamir Malzemesi',
      '100 Silah Geliştirme Malzemesi',
      '20 Araba Geliştirme Malzemesi',
    ],
    shopierUrl: 'https://www.shopier.com/cetelerinsavasi/49730517',
  },
];

export default function GoldStoreScreen() {
  const { user } = useAuth();
  const { player } = usePlayer();
  const [code, setCode] = useState(player?.redemptionCode || null);
  const [loadingCode, setLoadingCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (player?.redemptionCode) {
      setCode(player.redemptionCode);
      return;
    }
    if (!user) return;
    setLoadingCode(true);
    getMyRedemptionCode()
      .then((res) => setCode(res.data.code))
      .catch((err) => {
        console.error('Teslimat kodu alınamadı:', err);
        setError('Teslimat kodun yüklenemedi, sayfayı yenilemeyi dene.');
      })
      .finally(() => setLoadingCode(false));
  }, [user, player?.redemptionCode]);

  const handleCopy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Panoya erişim engellenmiş olabilir (bazı tarayıcı/izin
      // durumları) — sessizce yut, kod zaten ekranda görünüyor, elle
      // seçip kopyalayabilir.
    }
  };

  return (
    <div className="gold-store">
      <div className="gold-store-code-box">
        <p className="gold-store-code-title">Senin Teslimat Kodun</p>
        {loadingCode && <p className="gold-store-hint">Yükleniyor…</p>}
        {code && (
          <div className="gold-store-code-row">
            <span className="gold-store-code">{code}</span>
            <button className="gold-store-copy-btn" onClick={handleCopy}>
              {copied ? 'Kopyalandı ✓' : 'Kopyala'}
            </button>
          </div>
        )}
        <p className="gold-store-hint">
          Shopier'de satın alırken <strong>"Sipariş Notu"</strong> alanına bu kodu yapıştır,
          siparişin otomatik olarak hesabına yansıyacak. Kodu yazmayı unutursan
          cetelerinsavasi@gmail.com adresine mail atabilirsin.
        </p>
      </div>

      {error && <p className="gold-store-error">{error}</p>}

      <div className="gold-store-list">
        {PACKAGES.map((pack) => (
          <div key={pack.id} className="gold-store-card">
            <img className="gold-store-card-image" src={pack.image} alt={pack.title} />
            <p className="gold-store-price">{pack.priceLabel}</p>
            <ul className="gold-store-lines">
              {pack.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <a
              className="gold-store-btn"
              href={pack.shopierUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Shopier'de Satın Al ↗
            </a>
          </div>
        ))}
      </div>

      <p className="gold-store-footnote">
        Ödemeler tamamen Shopier'in kendi güvenli sayfasında yapılır, kart bilgin bize hiçbir
        zaman ulaşmaz. Satın alma sonrası altının hesabına yüklenmesi birkaç dakika sürebilir.
      </p>
    </div>
  );
}
