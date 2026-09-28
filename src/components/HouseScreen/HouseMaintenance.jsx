import './HouseScreen.css';

// Ev şimdilik sadece admin + davetlilere açık; diğer herkes bu ekranı görür.
export default function HouseMaintenance({ onClose }) {
  return (
    <div className="hs-root hs-maint">
      <div className="hs-maint-card">
        <div className="hs-maint-icon">🏗️</div>
        <h2>Ev Tadilatta</h2>
        <p>Evler yepyeni haliyle çok yakında burada! Kendi evini satın alacak, içini dilediğin gibi döşeyecek, arabalarını ve silah koleksiyonunu sergileyip arkadaşlarını davet edebileceksin.</p>
        <ul>
          <li>🛋️ Yüzlerce eşya, renk ve kaplama</li>
          <li>🏎️ Garajında arabalar ve motorlar</li>
          <li>👥 Arkadaşlarınla evde sohbet</li>
        </ul>
        <p className="hs-dim">Profilin artık alttaki <b>👤 Profil</b> sekmesinde.</p>
        <button className="hs-btn" onClick={onClose}>Tamam</button>
      </div>
    </div>
  );
}
