import { useState } from 'react';
import './ManagerBooklet.css';

// ManagerBooklet — Bölüm 19: "Menajerlik Kitapçığı". PoliceBooklet.jsx ile
// birebir aynı {title, body} sayfa deseni (bkz. src/components/PoliceBooklet).
// İçerik sabit metin — gerçek menajerlik sisteminin (Bölüm 2-14) güncel
// formüllerini ve kurallarını anlatır.
const PAGES = [
  {
    title: '📋 Menajer Ne Yapar',
    body: [
      'Sahibi olmadığın bir takımı, başkan gibi yönetirsin: kadro, taktik, transfer, doktor, bilet fiyatı, sponsorluk — hepsi sende.',
      'Harcamaların önce takımın günlük "Transfer Desteği"nden, o yetmezse takım kasasından çıkar — kendi cebinden gitmez.',
      'Takımın kazandığı tüm gelir (bilet, sponsor, sezon sonu) sana değil, takımın kasasına yatar.',
      'İstersen kendi cebinden kasaya bağış yapabilir, hatta takıma ücretli sponsor bile olabilirsin.',
    ],
  },
  {
    title: '✅ Menajer Olmak İçin',
    body: [
      'En az 50 saygınlığın olmalı (sadece başvuru anında bakılır).',
      'Menajeri olmayan bir takıma dilediğin an başvurabilirsin — bot takımlarda anında kabul edilirsin.',
      'Menajeri olan bir takıma ancak o menajerden seviyece kesin olarak yükseksen talep gönderebilirsin.',
      'Aynı anda sadece bir takımı yönetebilirsin — yeni bir takıma geçmek için önce istifa etmen gerekir.',
    ],
  },
  {
    title: '📈 Menajerlik Seviyen',
    body: [
      'Herkes 0 puanla başlar. Kazandığın her maç +1, kaybettiğin her maç −1 puan.',
      'Seviyen toplam puanına göre belirlenir: −9 ile 9 arası 0. seviye, 10–29 arası 1. seviye, 30–69 arası 2. seviye… Aralıklar her seviyede ikiye katlanır; eksi tarafta da aynısı geçerlidir.',
      'Örnek: 10 puanla 1. seviyeye çıktın, 1 maç kaybedersen 9 puana iner ve tekrar 0. seviye olursun.',
      'Seviyen hiçbir zaman sıfırlanmaz, kalıcıdır.',
      'Maaşın hem takımın liginden hem senin seviyenden belirlenir — her seviyede maaş %50 artar.',
    ],
  },
  {
    title: '💵 Maaşın',
    body: [
      'Maaşın her gün 19:00’da (maç bitince) otomatik hesabına yatar.',
      'İlk maaşını, göreve başladıktan tam 24 saat sonraki 19:00’da alırsın.',
      'Kasada para yetmezse maaşının eksiği borç olarak birikir — işten atılmazsın, borç kasa müsait olunca kapanır.',
      'Borç yüzünden istersen istifa edebilirsin; istifa edersen o günkü maaşı ve varsa borcunu alamazsın.',
    ],
  },
  {
    title: '🚪 Ne Zaman Ayrılırsın',
    body: [
      '3 maç üst üste kaybedersen görevden alınırsın — o sezon bu takıma bir daha başvuramazsın.',
      '3 gün üst üste takıma hiç dokunmazsan aynı şekilde görevden alınırsın.',
      'Kadro (sakatlık/emeklilik yüzünden) zorunlu minimumun altına düşerse görevden alınırsın: en az 3 kaleci, 4 defans, 4 orta saha, 4 forvet gerekir.',
      'Senden daha yüksek seviyeli bir menajer takımı devralırsa ya da başkan seni işten çıkarırsa, o günkü maaşını (ve varsa borcunu) alırsın.',
      'Kendi isteğinle istifa edersen o günkü maaşını alamazsın ve o sezon bu takıma dönemezsin.',
    ],
  },
];

export default function ManagerBooklet({ onClose }) {
  const [page, setPage] = useState(0);
  const current = PAGES[page];

  return (
    <div className="police-booklet-backdrop" onClick={onClose}>
      <div className="police-booklet" onClick={(e) => e.stopPropagation()}>
        <div className="police-booklet-header">
          <span className="police-booklet-page-num">
            {page + 1}/{PAGES.length}
          </span>
          <button className="police-booklet-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <h3 className="police-booklet-title">{current.title}</h3>
        <ul className="police-booklet-body">
          {current.body.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
        <div className="police-booklet-nav">
          <button className="police-booklet-nav-btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            ← Önceki
          </button>
          <button
            className="police-booklet-nav-btn"
            disabled={page === PAGES.length - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            Sonraki →
          </button>
        </div>
      </div>
    </div>
  );
}
