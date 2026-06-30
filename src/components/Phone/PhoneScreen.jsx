import './PhoneScreen.css';

const APPS = [
  { id: 'ikinci-el', label: '2.', note: 'İkinci El Satış' },
  { id: 'banka', label: '🏦', note: 'Banka' },
  { id: 'sms', label: '✉️', note: 'SMS' },
];

export default function PhoneScreen({ onClose }) {
  return (
    <div className="phone-screen">
      <div className="phone-screen-header">
        <button className="phone-back" onClick={onClose}>
          ← Haritaya dön
        </button>
        <span className="phone-clock">Neon Şehir</span>
      </div>

      <div className="phone-apps-grid">
        {APPS.map((app) => (
          <button key={app.id} className="phone-app" disabled>
            <span className="phone-app-icon">{app.label}</span>
            <span className="phone-app-name">{app.note}</span>
          </button>
        ))}
      </div>

      <p className="phone-placeholder-note">
        Telefon uygulamaları Faz 6'da geliştirilecek (Bölüm 9).
      </p>
    </div>
  );
}
