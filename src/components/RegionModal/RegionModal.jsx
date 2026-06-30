import './RegionModal.css';

export default function RegionModal({ region, onClose }) {
  if (!region) return null;

  return (
    <div className="region-modal-backdrop" onClick={onClose}>
      <div className="region-modal" onClick={(e) => e.stopPropagation()}>
        <div className="region-modal-handle" />
        <h2 className="region-modal-title">{region.name}</h2>
        <p className="region-modal-screen">
          Ekran: <code>{region.screen}</code>
        </p>
        <p className="region-modal-body">
          Bu mekanik henüz geliştirilmedi. Master prompttaki ilgili faz
          tamamlandığında burada gerçek içerik açılacak.
        </p>
        <button className="region-modal-close" onClick={onClose}>
          Kapat
        </button>
      </div>
    </div>
  );
}
