import { useState } from 'react';
import { usePoliceSalaryStats } from '../../hooks/usePoliceSalaryStats';
import './PoliceBooklet.css';

const STATIC_PAGES = [
  {
    title: 'Polisler Ne Yapar',
    body: [
      'Ekipçe yapılan soygunlara sivil gibi katılmaya çalışır. Dahil olabilirse, suçluları yakalamış olur.',
      'Artık kendi ekip soygun planını da (tuzak) kurabilir — tek şart ekibe kendisi dışında en az 1 suçlu katılması; ekipte kaç polis olduğunun (kendisi dahil) hiçbir önemi yoktur.',
      'Ama önce şüphe konuşur: ekipteki bir suçlu kendi şüphesi yüzünden yakalanırsa polis o turda ödül alamaz, sadece o suçlu kendi cezasını öder. Kimse şüpheden yakalanmazsa polis(ler) %100 yakalar ve ödülün tamamını alır.',
      'Polis(ler) böyle yakaladığı soygundan kazanılacak paranın tamamını ödül olarak alır (birden fazla polis varsa aralarında eşit bölüşülür).',
      'Yakalanan suçlular ödül miktarı kadar ceza yer, bu ceza ekipteki suçlu sayısına bölünür.',
    ],
  },
  {
    title: 'Polis Olmak İçin Ne Gerekir',
    body: [
      'Şüphe puanın 0 olmalı.',
      'Bir silaha sahip olmalısın.',
      'Polisler tek başına (solo) soygun/haraç gibi şüphe artıran hiçbir suç işleyemez.',
    ],
  },
];

export default function PoliceBooklet({ onClose }) {
  const [page, setPage] = useState(0);
  const { avgDailyPayout } = usePoliceSalaryStats();

  const salaryBody =
    avgDailyPayout != null
      ? [
          'Polisler verilen rüşvetleri aralarında bölüşürler.',
          `Polisler son 10 günde, günlük ortalama ${avgDailyPayout.toLocaleString('tr-TR')} altın kazandı.`,
          'Çökerttikleri soygunlardaki ödüllerin tamamını kazanırlar.',
        ]
      : [
          'Polisler verilen rüşvetleri aralarında bölüşürler.',
          'Çökerttikleri soygunlardaki ödüllerin tamamını kazanırlar.',
        ];

  const pages = [
    STATIC_PAGES[0],
    { title: 'Polisler Ne Kadar Kazanır', body: salaryBody },
    STATIC_PAGES[1],
  ];
  const current = pages[page];

  return (
    <div className="police-booklet-backdrop" onClick={onClose}>
      <div className="police-booklet" onClick={(e) => e.stopPropagation()}>
        <div className="police-booklet-header">
          <span className="police-booklet-page-num">
            {page + 1}/{pages.length}
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
            disabled={page === pages.length - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            Sonraki →
          </button>
        </div>
      </div>
    </div>
  );
}
