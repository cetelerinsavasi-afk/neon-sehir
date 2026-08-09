import { useState } from 'react';
import { X } from 'lucide-react';
import { useVehicles } from '../../hooks/useVehicles';
import { useRecentFutbolBets } from '../../hooks/useRecentFutbolBets';
import { vehicleImage } from '../VehicleCard/VehicleCard';
import { createSixtagramPost } from '../../services/gameActions';
import './ComposeModal.css';

const MAX_LEN = 280;

const ATTACHMENT_TYPES = [
  { id: 'avatar', label: 'Avatarım', emoji: '🧑' },
  { id: 'vehicle', label: 'Arabam', emoji: '🚗' },
  { id: 'iddaa', label: 'İddaa Kuponum', emoji: '🎟️' },
  { id: 'matches', label: 'Günün Maçları', emoji: '⚽' },
  { id: 'investment', label: 'Yatırım Grafiği', emoji: '📈' },
  { id: 'fine', label: 'Bugünkü Cezam', emoji: '🚨' },
];

const ASSET_OPTIONS = [
  { id: 'diamond', label: 'Elmas' },
  { id: 'stock', label: 'Hisse Senedi' },
  { id: 'crypto', label: 'Kripto' },
];

export default function ComposeModal({ onClose, onPosted }) {
  const [text, setText] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [subPicker, setSubPicker] = useState(null); // 'vehicle' | 'iddaa' | 'investment' | null
  const [attachmentDraft, setAttachmentDraft] = useState(null); // { type, ...params }
  const [attachmentPreviewLabel, setAttachmentPreviewLabel] = useState('');
  const [error, setError] = useState('');
  const [posting, setPosting] = useState(false);

  const { vehicles } = useVehicles();
  const { bets } = useRecentFutbolBets();

  const chooseType = (typeId) => {
    setError('');
    if (typeId === 'vehicle' || typeId === 'iddaa' || typeId === 'investment') {
      setSubPicker(typeId);
      return;
    }
    setAttachmentDraft({ type: typeId });
    setAttachmentPreviewLabel(ATTACHMENT_TYPES.find((t) => t.id === typeId)?.label || typeId);
    setPickerOpen(false);
  };

  const chooseVehicle = (vehicle) => {
    setAttachmentDraft({ type: 'vehicle', vehicleId: vehicle.id });
    setAttachmentPreviewLabel(vehicle.model);
    setSubPicker(null);
    setPickerOpen(false);
  };

  const chooseBet = (bet) => {
    setAttachmentDraft({ type: 'iddaa', betId: bet.id });
    setAttachmentPreviewLabel(`${bet.round}. Hafta Kuponu`);
    setSubPicker(null);
    setPickerOpen(false);
  };

  const chooseAsset = (asset) => {
    setAttachmentDraft({ type: 'investment', asset: asset.id });
    setAttachmentPreviewLabel(asset.label);
    setSubPicker(null);
    setPickerOpen(false);
  };

  const removeAttachment = () => {
    setAttachmentDraft(null);
    setAttachmentPreviewLabel('');
  };

  const handleSubmit = async () => {
    if (!text.trim() && !attachmentDraft) {
      setError('Bir şeyler yaz ya da bir ek ekle.');
      return;
    }
    setError('');
    setPosting(true);
    try {
      await createSixtagramPost(text.trim(), attachmentDraft);
      onPosted?.();
      onClose();
    } catch (err) {
      console.error('Sixtagram paylaşım hatası:', err);
      setError(err.message || 'Paylaşılamadı, tekrar dene.');
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="six-compose-backdrop" onClick={onClose}>
      <div className="six-compose" onClick={(e) => e.stopPropagation()}>
        <div className="six-compose-head">
          <p className="six-compose-title">Yeni Gönderi</p>
          <button className="six-compose-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <textarea
          className="six-compose-textarea"
          placeholder="Neler oluyor?"
          value={text}
          maxLength={MAX_LEN}
          onChange={(e) => setText(e.target.value)}
          rows={4}
        />
        <p className="six-compose-counter">
          {text.length}/{MAX_LEN}
        </p>

        {attachmentDraft && (
          <div className="six-compose-attachment-chip">
            <span>📎 {attachmentPreviewLabel}</span>
            <button onClick={removeAttachment}>
              <X size={14} />
            </button>
          </div>
        )}

        {error && <p className="six-compose-error">{error}</p>}

        <div className="six-compose-footer">
          <button className="six-compose-image-btn" onClick={() => setPickerOpen((v) => !v)}>
            🖼️ Görsel Ekle
          </button>
          <button className="six-compose-submit" onClick={handleSubmit} disabled={posting}>
            {posting ? 'Paylaşılıyor…' : 'Paylaş'}
          </button>
        </div>

        {pickerOpen && !subPicker && (
          <div className="six-compose-picker">
            {ATTACHMENT_TYPES.map((t) => (
              <button key={t.id} className="six-compose-picker-item" onClick={() => chooseType(t.id)}>
                <span className="six-compose-picker-emoji">{t.emoji}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        )}

        {subPicker === 'vehicle' && (
          <div className="six-compose-sublist">
            <p className="six-compose-sublist-title">Hangi araban?</p>
            {vehicles.length === 0 && (
              <p className="six-compose-sublist-empty">Henüz bir araban yok.</p>
            )}
            {vehicles.map((v) => (
              <button key={v.id} className="six-compose-sublist-item" onClick={() => chooseVehicle(v)}>
                {vehicleImage(v.catalogId) && (
                  <img src={vehicleImage(v.catalogId)} alt={v.model} />
                )}
                <span>{v.model}</span>
              </button>
            ))}
            <button className="six-compose-sublist-back" onClick={() => setSubPicker(null)}>
              ← Geri
            </button>
          </div>
        )}

        {subPicker === 'iddaa' && (
          <div className="six-compose-sublist">
            <p className="six-compose-sublist-title">Hangi kupon?</p>
            {bets.length === 0 && (
              <p className="six-compose-sublist-empty">Henüz bir kuponun yok.</p>
            )}
            {bets.map((b) => (
              <button key={b.id} className="six-compose-sublist-item" onClick={() => chooseBet(b)}>
                <span>
                  {b.round}. Hafta · {b.stake.toLocaleString('tr-TR')} altın ·{' '}
                  {b.status === 'pending' ? 'Bekliyor' : b.status === 'won' ? 'Kazandı' : 'Kaybetti'}
                </span>
              </button>
            ))}
            <button className="six-compose-sublist-back" onClick={() => setSubPicker(null)}>
              ← Geri
            </button>
          </div>
        )}

        {subPicker === 'investment' && (
          <div className="six-compose-sublist">
            <p className="six-compose-sublist-title">Hangi piyasa?</p>
            {ASSET_OPTIONS.map((a) => (
              <button key={a.id} className="six-compose-sublist-item" onClick={() => chooseAsset(a)}>
                <span>{a.label}</span>
              </button>
            ))}
            <button className="six-compose-sublist-back" onClick={() => setSubPicker(null)}>
              ← Geri
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
