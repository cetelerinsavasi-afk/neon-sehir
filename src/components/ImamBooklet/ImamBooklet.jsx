import NeonBooklet from '../NeonBooklet/NeonBooklet';

// İmam kitapçığı — KULLANICI İSTEĞİ (v109): RP'ye uygun, basit, detaya
// boğmadan havalı anlatım. Her sayfa tek konu, kısa cümleler.
const PAGES = [
  {
    title: 'Şehrin İmamı',
    icon: '🕌',
    body: [
      'Neon Şehir\'in tek bir imamı vardır. Cami onun emanetidir.',
      'Polisler imam olamaz. Bir oyuncu ya imam ya polis olabilir.',
      'Maaşını belediye belirler, her gece 00:00\'da belediye kasasından yatar.',
    ],
  },
  {
    title: 'Kürsüye Çıkmak',
    icon: '📜',
    body: [
      'Aranan: 📋 temel görevlerin tamamı, 10 saygınlık ve %0 şüphe.',
      'Bu şartlar sadece başvururken aranır.',
      'Kürsü boşsa başvurduğun an imam olursun.',
      'Bekleyen bir polislik başvurun varsa önce onun sonuçlanmasını beklemelisin.',
    ],
  },
  {
    title: 'İmamın Yükü',
    icon: '🤲',
    body: [
      'Her gün 5 vakit ibadet ve en az 1 nasihat.',
      'Görevini aksatan imam kürsüden indirilir ve 24 saat geri dönemez.',
      'İstersen Camii\'den istifa edebilirsin; 24 saat yeniden başvuramazsın.',
    ],
  },
];

export default function ImamBooklet({ onClose }) {
  return <NeonBooklet pages={PAGES} onClose={onClose} theme="imam" badge="🕌" title="İmam Kitapçığı" />;
}
