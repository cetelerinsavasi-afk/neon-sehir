import { useState } from 'react';
import '../PoliceBooklet/PoliceBooklet.css';

// İmam kitapçığı — KULLANICI İSTEĞİ: "baştan yazalım, gereksiz bilgileri
// kaldıralım, olabildiğince net basit anlaşılır olsun". Her sayfa tek bir
// konuyu, kısa cümlelerle anlatır.
const PAGES = [
  {
    title: 'İmam Kimdir',
    body: [
      'Oyunda tek bir imam vardır.',
      'İmamlık bir meslek değil, bir statüdür: fabrikada çalışmaya ve suç işlemeye devam edebilirsin.',
      'Polis imam olamaz, imam da polis olamaz.',
      'İmam maaşı günde 10.000 altındır. Camiden günde 1 kez alırsın.',
    ],
  },
  {
    title: 'İmam Olmak İçin',
    body: [
      'Saygınlığın en az 50 olmalı.',
      'Şüphen %0 olmalı.',
      'Bu iki şart sadece başvururken aranır. İmam olduktan sonra şüphen artsa ya da saygınlığın düşse de imamlığın gitmez.',
    ],
  },
  {
    title: 'İmamın Görevleri',
    body: [
      'Her gün 5 vakit ibadet et. (Göreve başladığın andan önceki vakitler sayılmaz.)',
      'Her gün en az 1 nasihat ver.',
      'Bu görevlerden birini aksatırsan imamlıktan alınırsın. Alındıktan 24 saat sonra tekrar başvurabilirsin.',
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
