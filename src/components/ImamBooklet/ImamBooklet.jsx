import { useState } from 'react';
import '../PoliceBooklet/PoliceBooklet.css';

const PAGES = [
  {
    title: 'İmamın Görevleri Neler',
    body: ['Günde 5 vakit ibadete katılmalı.', 'Her gün en az 1 nasihat vermeli.'],
  },
  {
    title: 'İmamlar Ne Kadar Kazanır',
    body: ['Oyunda tek imam vardır.', 'İmam maaşı günde 10.000 altındır.'],
  },
  {
    title: 'İmam Olmak İçin Ne Gerekir',
    body: [
      '50 saygınlık gerekir.',
      'Şüphe puanın %0 olmalı.',
      'İmamlar suç işleyemez, polis olamaz, fabrikada çalışamaz.',
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
