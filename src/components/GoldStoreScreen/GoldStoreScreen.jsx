import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { getMyRedemptionCode, buyEmeraldOffer } from '../../services/gameActions';
import zumrut50Image from '../../assets/goldStore/zumrut50.jpg';
import zumrut200Image from '../../assets/goldStore/zumrut200.jpg';
import altin30kImage from '../../assets/goldStore/altin30k.jpg';
import altin100kImage from '../../assets/goldStore/altin100k.jpg';
import './GoldStoreScreen.css';

// v66 — ZÜMRÜT MAĞAZASI (eski Altın Mağazası).
// Üstte gerçek parayla ZÜMRÜT paketleri (Shopier), altta zümrütle alınan
// altın paketleri. Gerçek fiyat/miktarlar SUNUCUDA (functions/index.js >
// GOLD_STORE_PACKAGES, EMERALD_SHOP_OFFERS); buradakiler sadece görsel.
// Shopier ürün ID'leri değişmedi (fiyatlar Shopier panelinden 29/99 TL).
const BUY_PACKAGES = [
  {
    id: 'paket1',
    title: '50 Zümrüt',
    priceLabel: '29 TL',
    image: zumrut50Image,
    shopierUrl: 'https://www.shopier.com/cetelerinsavasi/49730536',
  },
  {
    id: 'paket2',
    title: '200 Zümrüt',
    priceLabel: '99 TL',
    image: zumrut200Image,
    badge: 'EN AVANTAJLI',
    shopierUrl: 'https://www.shopier.com/cetelerinsavasi/49730517',
  },
];

const SPEND_OFFERS = [
  { id: 'altin30k', title: '30.000 Altın', cost: 49, image: altin30kImage, lines: ['30.000 Altın'] },
  {
    id: 'altin100k',
    title: '100.000 Altın + Ekstra Hediyeler',
    cost: 199,
    image: altin100kImage,
    lines: ['100.000 Altın', '4 Yasaklı Madde', '1.000 Tamir Malzemesi', '100 Silah Geliştirme Malzemesi', '20 Araba Geliştirme Malzemesi'],
  },
];

export function EmeraldAmount({ value, size = 16 }) {
  return (
    <span className="emerald-amount">
      <span className="emerald-icon" style={{ width: size, height: size }} />
      {Number(value || 0).toLocaleString('tr-TR')}
    </span>
  );
}

export default function GoldStoreScreen() {
  const { user } = useAuth();
  const { player } = usePlayer();
  const [code, setCode] = useState(player?.redemptionCode || null);
  const [loadingCode, setLoadingCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(null); // offer
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { ok, text }
  const emerald = Number(player?.emerald || 0);

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
      // panoya erişim yoksa kod zaten ekranda
    }
  };

  const doBuy = async () => {
    if (!confirm || busy) return;
    setBusy(true);
    try {
      await buyEmeraldOffer(confirm.id);
      setResult({ ok: true, text: `${confirm.title} hesabına yüklendi!` });
    } catch (err) {
      setResult({ ok: false, text: err?.message || 'Satın alınamadı.' });
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  return (
    <div className="gold-store">
      <div className="emerald-balance">
        <span className="emerald-balance-label">Zümrüt bakiyen</span>
        <EmeraldAmount value={emerald} size={22} />
      </div>

      <p className="gold-store-section">💳 Zümrüt Satın Al</p>
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
          zümrütlerin otomatik olarak hesabına yansıyacak. Kodu yazmayı unutursan
          studyohustle@gmail.com adresine mail atabilirsin.
        </p>
      </div>
      {error && <p className="gold-store-error">{error}</p>}

      <div className="gold-store-grid">
        {BUY_PACKAGES.map((pack) => (
          <div key={pack.id} className="gold-store-card emerald">
            {pack.badge && <span className="gold-store-badge">{pack.badge}</span>}
            <img className="gold-store-card-image" src={pack.image} alt={pack.title} />
            <p className="gold-store-price">{pack.priceLabel}</p>
            <a className="gold-store-btn emerald" href={pack.shopierUrl} target="_blank" rel="noopener noreferrer">
              Satın Al ↗
            </a>
          </div>
        ))}
      </div>

      <p className="gold-store-section">💎 Zümrüt Harca</p>
      <div className="gold-store-list">
        {SPEND_OFFERS.map((o) => (
          <div key={o.id} className="gold-store-card">
            <img className="gold-store-card-image" src={o.image} alt={o.title} />
            <ul className="gold-store-lines">
              {o.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <button className="gold-store-btn" disabled={!user} onClick={() => { setResult(null); setConfirm(o); }}>
              <EmeraldAmount value={o.cost} /> &nbsp;karşılığında al
            </button>
          </div>
        ))}
      </div>

      {result && <p className={result.ok ? 'gold-store-success' : 'gold-store-error'}>{result.text}</p>}

      <p className="gold-store-footnote">
        Ödemeler tamamen Shopier'in kendi güvenli sayfasında yapılır, kart bilgin bize hiçbir
        zaman ulaşmaz. Satın alma sonrası zümrütlerin hesabına yüklenmesi birkaç dakika sürebilir.
      </p>

      {confirm && (
        <div className="gold-store-confirm-bg" onClick={() => !busy && setConfirm(null)}>
          <div className="gold-store-confirm" onClick={(e) => e.stopPropagation()}>
            <p className="gold-store-confirm-title">{confirm.title}</p>
            <p className="gold-store-confirm-cost">
              Fiyat: <EmeraldAmount value={confirm.cost} size={18} />
            </p>
            <p className="gold-store-hint">
              Bakiyen: <EmeraldAmount value={emerald} /> → {emerald >= confirm.cost ? <EmeraldAmount value={emerald - confirm.cost} /> : <b style={{ color: 'var(--neon-pink)' }}>yetersiz zümrüt</b>}
            </p>
            <div className="gold-store-confirm-row">
              <button className="gold-store-btn gold-store-btn-secondary" disabled={busy} onClick={() => setConfirm(null)}>Vazgeç</button>
              <button className="gold-store-btn emerald" disabled={busy || emerald < confirm.cost} onClick={doBuy}>
                {busy ? 'İşleniyor…' : 'Onayla'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
