import { useState } from 'react';
import { usePoliceSalaryStats } from '../../hooks/usePoliceSalaryStats';
import './PoliceBooklet.css';

// Polis kitapçığı — v109: İstihbarat ile Polis birleşti (Polis Teşkilatı).
// KULLANICI İSTEĞİ: RP'ye uygun, basit, detaya boğmadan havalı anlatım.
// Her sayfa tek konu, kısa cümleler. Sayılar sunucuyla aynı olmalı
// (functions/gang/config.js INTEL / SALARIES / POLICE).
const PAGES_BEFORE_SALARY = [
  {
    title: 'Rozeti Takmak',
    body: [
      'Şehrin karanlığına karşı duran tek güç: Polis Teşkilatı.',
      'Aranan: 50 saygınlık, temiz bir sicil (%0 şüphe), en az 1 silah ve 📋 temel görevlerin tamamı.',
      'İmamlar ve Mafya Babaları rozet takamaz.',
      'Karakol\'dan ya da Çeteler › Polis Teşkilatı\'ndan kod adını yazman yeterli — şartları sağlıyorsan rozet anında senin.',
      'Yeni rozetli 24 saat boyunca teşkilattan atılamaz.',
    ],
  },
  {
    title: 'Gölgedeki Teşkilat',
    body: [
      'Teşkilatta herkes kod adıyla tanınır. Gerçek kimliğin gizli kalır.',
      'Çeteden ayrılmak zorunda değilsin — içeriden çalışan bir köstebek olabilirsin.',
      'Çetenin tırını ihbar et ya da yükünü sızdır: her biri +500.000 prestij.',
      'Cumartesi savaşlarına ve operasyonlara teşkilat adına katıl, güç göster, prestij topla.',
      'Prestij rütbeni belirler: Emniyet Genel Müdürü, Emniyet Amiri, Başkomiser, Komiser, Polis Memuru.',
    ],
  },
];

const PAGES_AFTER_SALARY = [
  {
    title: 'Soygun Durdurmak',
    body: [
      'Bir soygun ekibine sız ya da kendi ekibini kurup tuzak hazırla.',
      'Ekipte sivil varsa soygun patlar: suçlular yakalanır, cezası anında kesilir.',
      'Kurtarılan paradan payını (oranını belediye belirler) alırsın, gerisi devlete. Ekipte birden fazla polis varsa pay bölünür.',
      'Üstüne kurtarılan paranın 4 katı prestij (polis sayısına bölünür). Örnek: 2 polis 500.000 kurtarırsa kişi başı 1.000.000 prestij.',
      'Ama dikkat: ekipten biri kendi şüphesi yüzünden yakalanırsa operasyon boşa gider, ödül yok.',
      'Ekipte kimin polis olduğunu kimse bilmez.',
    ],
  },
  {
    title: 'Kirli Rozet',
    body: [
      'Rozetin olması suç işleyemeyeceğin anlamına gelmez.',
      'Yasaklı madde satabilir, soygun yapabilirsin. Sadece ekipte hiç sivil yoksa soygun gerçek soygundur.',
      'Yakalanırsan ceza 2 katı. Şehir, kirli polisi affetmez.',
    ],
  },
  {
    title: 'Rozeti Bırakmak',
    body: [
      'İstediğin an istifa edebilirsin.',
      'İstifa edersen ya da teşkilattan atılırsan prestijin, rütben ve sicilin silinir; 24 saat yeniden başvuramazsın.',
      '10 gün şehre uğramayan polis görevden alınır.',
    ],
  },
];

export default function PoliceBooklet({ onClose }) {
  const [page, setPage] = useState(0);
  const { avgDailyPayout } = usePoliceSalaryStats();

  const salaryBody = [
    'Maaşını devlet öder, her gece 00:00\'da hesabına yatar.',
    'Polis Memuru 5.000 · Komiser 10.000 · Başkomiser 15.000 · Emniyet Amiri 20.000 · Emniyet Genel Müdürü 25.000.',
    'Gün boyu Karakol\'a bırakılan rüşvetler o gece teşkilattaki polislere eşit bölünür ve maaşınla birlikte gelir.',
    ...(avgDailyPayout != null ? [`Son 10 günde rüşvet payı günlük ortalama ${avgDailyPayout.toLocaleString('tr-TR')} altın.`] : []),
  ];

  const pages = [...PAGES_BEFORE_SALARY, { title: 'Maaş ve Rüşvet', body: salaryBody }, ...PAGES_AFTER_SALARY];
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
