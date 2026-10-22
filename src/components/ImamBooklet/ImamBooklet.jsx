import { useState } from 'react';
import '../PoliceBooklet/PoliceBooklet.css';

// İmam kitapçığı — KULLANICI İSTEĞİ (v109): RP'ye uygun, basit, detaya
// boğmadan havalı anlatım. Her sayfa tek konu, kısa cümleler.
const PAGES = [
  {
    title: 'Şehrin İmamı',
    body: [
      'Neon Şehir\'in tek bir imamı vardır. Cami onun emanetidir.',
      'Polisler imam olamaz. Bir oyuncu ya imam ya polis olabilir.',
      'Maaşın 10.000 altın, her gece 00:00\'da devletten yatar.',
    ],
  },
  {
    title: 'Kürsüye Çıkmak',
    body: [
      'Aranan: 📋 temel görevlerin tamamı, 50 saygınlık ve %0 şüphe.',
      'Bu şartlar sadece başvururken aranır.',
      'Kürsü boşsa başvurduğun an imam olursun.',
      'Bekleyen bir polislik başvurun varsa önce onun sonuçlanmasını beklemelisin.',
    ],
  },
  {
    title: 'İmamın Yükü',
    body: [
      'Her gün 5 vakit ibadet ve en az 1 nasihat.',
      'Görevini aksatan imam kürsüden indirilir ve 24 saat geri dönemez.',
      'İstersen Camii\'den istifa edebilirsin; 24 saat yeniden başvuramazsın.',
    ],
  },
];

export default function ImamBooklet({ onClose }) {
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
