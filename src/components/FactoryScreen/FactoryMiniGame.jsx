import HookGoldGame from './HookGoldGame';

// FactoryMiniGame — eskiden (yeni istek üzerine) 3 farklı mini oyun
// (koli yakalama / kanca ile altın / bant senkronu) arasından rastgele
// biri seçiliyordu. KULLANICI REVİZESİ: "bunlardan 2 sini kaldıracağız
// sadece kancayla altın yakalama oyunu kalsın diğerlerini iptal edelim" —
// artık rastgele seçim YOK, üretim her tetiklendiğinde DOĞRUDAN
// HookGoldGame açılıyor. FactoryShiftGame.jsx ve TempoSyncGame.jsx
// dosyaları silinmedi (ileride geri istenirse diye), sadece burada
// kullanılmıyorlar. FactoryScreen.jsx'teki HER İKİ çağrı yeri (WorkerView +
// OwnerView) hâlâ bu bileşeni (`FactoryMiniGame`) kullanıyor — dış arayüz
// (`onComplete`/`onClose` prop'ları) DEĞİŞMEDİ, bu yüzden FactoryScreen.jsx
// tarafında hiçbir değişiklik gerekmedi.
export default function FactoryMiniGame({ onComplete, onClose }) {
  return <HookGoldGame onComplete={onComplete} onClose={onClose} />;
}
