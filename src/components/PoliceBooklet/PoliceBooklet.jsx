import { useState } from 'react';
import { usePoliceSalaryStats } from '../../hooks/usePoliceSalaryStats';
import './PoliceBooklet.css';

// Polis kitapçığı — KULLANICI İSTEĞİ: "baştan yazalım, gereksiz bilgileri
// kaldıralım, olabildiğince net basit anlaşılır olsun". Polisler artık suç da
// işleyebiliyor (yasaklı madde satışı, soygun) — tek fark yakalanınca ceza 2
// katı. Her sayfa tek bir konuyu, kısa cümlelerle anlatır.
const PAGES_BEFORE_SALARY = [
  {
    title: 'Polis Olmak İçin',
    body: [
      'Başvuru anında şüphen %0 olmalı.',
      'Bir silahın olmalı. Polisken de en az 1 silahın kalmalı.',
      'Ana ekrandaki 📋 butonundaki temel görevleri bitirmiş olmalısın.',
      'Başvuru gece 00:00\'da onaylanır.',
      'Şüphe sadece başvuruda aranır. Polis olduktan sonra şüphenin önemi yoktur.',
      'Polis fabrikada çalışamaz.',
    ],
  },
];

const PAGES_AFTER_SALARY = [
  {
    title: 'Polis Suç İşleyebilir',
    body: [
      'Polisler de yasaklı madde satabilir ve soygun yapabilir.',
      'Kurallar sivillerle aynıdır: şüphen artar, yakalanırsan saygınlığın düşer.',
      'Tek fark: yakalanırsan ceza 2 katıdır.',
      'Örnek: Parkta yasaklı madde satarken yakalanırsan 5.000 değil 10.000 altın borç yazılır.',
    ],
  },
  {
    title: 'Soygun Yapmak',
    body: [
      'Gücün yetiyorsa yeri tek başına soyabilirsin.',
      'Gücün yetmiyorsa ekip kur (en fazla 4 kişi).',
      'Ekipte sadece polisler varsa soygun normal soygundur: ödül eşit bölüşülür, yakalanırsanız herkes 2 kat ceza yer.',
    ],
  },
  {
    title: 'Suçluyu Yakalamak',
    body: [
      'Ekipte polis olmayan biri varsa, sen suçluyu yakalamış olursun. Ceza yemezsin.',
      'Ödülün tamamını alırsın. Ekipte birden fazla polis varsa aranızda eşit bölüşülür.',
      'Suçlulara ödül kadar ceza yazılır. Ceza, suçlu sayısına bölünür.',
      'İstisna: ekipteki biri (sen dahil) kendi şüphesi yüzünden yakalanırsa bu turda ödül yok, ceza sadece suçlulara yazılır. Bu yüzden şüphesi yüksek bir polis tuzağı bozabilir.',
      'Ekipte kimin polis olduğu gizlidir.',
    ],
  },
];

export default function PoliceBooklet({ onClose }) {
  const [page, setPage] = useState(0);
  const { avgDailyPayout } = usePoliceSalaryStats();

  const salaryBody =
    avgDailyPayout != null
      ? [
          'Verilen rüşvetler bir havuzda toplanır, polisler aralarında bölüşür.',
          'Maaşını Karakol\'dan günde 1 kez alırsın.',
          `Son 10 günde günlük ortalama ${avgDailyPayout.toLocaleString('tr-TR')} altın kazandılar.`,
          'Maaşını 3 gün üst üste almazsan polislikten atılırsın.',
        ]
      : [
          'Verilen rüşvetler bir havuzda toplanır, polisler aralarında bölüşür.',
          'Maaşını Karakol\'dan günde 1 kez alırsın.',
          'Maaşını 3 gün üst üste almazsan polislikten atılırsın.',
        ];

  const pages = [...PAGES_BEFORE_SALARY, { title: 'Maaş', body: salaryBody }, ...PAGES_AFTER_SALARY];
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
