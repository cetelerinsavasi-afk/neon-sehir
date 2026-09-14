import { useState } from 'react';
import './ManagerBooklet.css';

// ManagerBooklet — Bölüm 19: "Menajerlik Kitapçığı". PoliceBooklet.jsx ile
// birebir aynı {title, body} sayfa deseni (bkz. src/components/PoliceBooklet).
// İçerik sabit metin — gerçek menajerlik sisteminin (Bölüm 2-14) güncel
// formüllerini ve kurallarını anlatır.
const PAGES = [
  {
    title: 'Menajer Nasıl Olunur',
    body: [
      'Menajer olmak için en az 50 saygınlığın olmalı.',
      'Menajeri OLMAYAN bir takıma (bot yönetimindeki ya da başkanı 5+ gündür pasif olan takımlar) başvurursan ANINDA kabul edilirsin — ertesi gün saat 19:00’da göreve başlarsın.',
      'Başkanı aktif olan sahipli bir takıma ancak başkan takımını gönüllü olarak "Menajer Ol" listesine açtıysa başvurabilirsin; başkan başvurular arasından birini seçer.',
      'Zaten bir takımı yönetiyorsan yeni bir takıma başvuramazsın — önce mevcut takımından ayrılman (istifa) gerekir.',
      'Bir takımdan (o sezon içinde) istifa edersen ya da kovulursan/3 kayıp ya da hareketsizlik yüzünden ayrılırsan, o sezon aynı takıma tekrar başvuramazsın.',
    ],
  },
  {
    title: 'Menajer Ne Yapar',
    body: [
      'Yönettiğin takımın kadrosunu, dizilimini/taktiğini, transferlerini, doktorunu, antrenmanını, bilet fiyatını ve sponsorluklarını başkan gibi yönetirsin.',
      'Harcamaların (transfer, doktor) kişisel altınından DEĞİL, önce takımın günlük "Transfer Desteği" bütçesinden, o yetmezse takım kasasından karşılanır.',
      'Takımın maç/bilet/sezon sonu/sponsorluk gelirleri kişisel hesabına değil, takım kasasına yatar — kasa MANAGED bir takımda tavansızdır.',
      'Menajer olarak yönettiğin takımla aynı anda kendi sahibi olduğun BAŞKA bir takımın da olabilir — ikisi birbirinden bağımsızdır.',
    ],
  },
  {
    title: 'Maaş, Borç ve Seviye',
    body: [
      'Her gece 19:00’da takım kasasından maaşın otomatik ödenir. İlk maaşın, göreve başladıktan tam 24 saat sonraki 19:00’da ödenir.',
      'Kasada yeterli para yoksa maaşın kısmi ödenir, kalanı "borç" olarak birikir — borç sonraki günlerde kasa müsait olunca kapatılmaya çalışılır.',
      'Menajerlik seviyen 0’dan başlar, kazandığın her maçta +1, kaybettiğin her maçta -1 puan biriktirir. Seviye değiştirmek için gereken net puan her seviyede katlanır (0→1 için 10, 1→2 için 20, 2→3 için 40, ...) — seviye hiçbir zaman başka bir sebeple sıfırlanmaz.',
      'Maaşın hem takımın lig kademesine hem de SENİN seviyene göre artar — her seviyede maaş %50 artar (negatif seviyede aynı oranda azalır).',
      'Kendi takımını (menajersiz) yöneten başkanların da bir menajerlik seviyesi vardır — sadece saf bot takımların maçları kimsenin seviyesini etkilemez.',
    ],
  },
  {
    title: 'Devralma ve Ayrılma',
    body: [
      'Menajeri olan bir takımı, SADECE mevcut menajerden kesin olarak daha yüksek seviyeliysen devralma talebi gönderebilirsin.',
      'Takım bot kökenliyse (hiç başkanı yoksa) devralma talebin anında onaylanır; sahipli bir takımda başkanın onayı gerekir.',
      'Bir devralma/atama onaylandığı andan itibaren, o takım ertesi gün 19:00’da yeni menajer göreve fiilen başlayana kadar başka HİÇBİR teklif/başvuru kabul etmez.',
      '3 maç üst üste kaybedersen, 3 gün üst üste hiç işlem yapmazsan ya da kendi isteğinle istifa edersen görevden ayrılırsın; başkan seni istediği an işten de çıkarabilir.',
      'İstifa edersen o günün maaşını alamazsın ve borcun silinir ama o sezon takıma dönemezsin; kovulursan (başkan işten çıkarırsa) maaşın+borcun kasadan mümkün olduğunca ödenir ve sezon yasağı yoktur.',
    ],
  },
  {
    title: 'Başkanlar İçin',
    body: [
      'Menajerin varken takımının kasasındaki paranın günlük en fazla %20’sini kişisel hesabına çekebilirsin; daha fazlası için menajerinden onay istemen gerekir.',
      'İstersen kişisel altınından kasaya bağış da yapabilirsin — bir tavan yok.',
      'Takımını 5 gün boyunca hiç yönetmezsen (transfer/kadro/doktor gibi hiçbir işlem yapmazsan) takımın geçici olarak "oto-bot" moduna geçer — kasa bot mantığıyla çalışmaya devam eder, dilediğin an bir işlem yaparak ya da "Kasayı Boşalt" butonuyla geri alabilirsin.',
      '50 gün boyunca hiç aktif olmazsan takımın elinden tamamen alınır (anında satış fiyatı kadar altın hesabına yatar) ve bot yönetimine geçer.',
      'Bir takımın kadrosu her zaman en az 3 kaleci, 4 defans, 4 orta saha, 4 forvet içermelidir — bu sınırın altına düşen menajerli bir takımın menajeri görevden alınır.',
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
