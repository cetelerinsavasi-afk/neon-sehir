import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import SimpleActionScreen from '../SimpleActionScreen/SimpleActionScreen';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import QuantityStepper from '../QuantityStepper/QuantityStepper';
import { useMosqueAttendance } from '../../hooks/useMosqueAttendance';
import { useBeggars } from '../../hooks/useBeggars';
import { prayAtMosque, becomeBeggar, donateToBeggar } from '../../services/gameActions';
import './MosqueScreen.css';

const WINDOW_HOURS = {
  1: '00:00-12:00',
  2: '12:00-15:00',
  3: '15:00-18:00',
  4: '18:00-21:00',
  5: '21:00-24:00',
};

const BEGGAR_WEALTH_LIMIT = 20000;

function BecomeBeggarForm({ onClose, onDone }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async () => {
    setBusy(true);
    setError(null);
    try {
      await becomeBeggar(note.trim());
      onDone();
      onClose();
    } catch (err) {
      setError(err.message || 'Dilenci olunamadı.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="beggar-form-backdrop" onClick={onClose}>
      <div className="beggar-form" onClick={(e) => e.stopPropagation()}>
        <p className="beggar-form-title">Dilenci Ol</p>
        <p className="beggar-form-hint">
          Bağışçıların görmesi için kısa bir not yazabilirsin. Toplam servetin (elindeki altın +
          bankadaki/yatırımlardaki para) {BEGGAR_WEALTH_LIMIT.toLocaleString('tr-TR')} altını
          aşıyorsa dilenci olamazsın.
        </p>
        <textarea
          className="beggar-note-input"
          maxLength={140}
          placeholder="Örn: Kirayı ödeyemiyorum, yardım edin..."
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {error && <p className="beggar-error">{error}</p>}
        <div className="beggar-form-actions">
          <button className="beggar-btn" disabled={busy} onClick={onClose}>
            Vazgeç
          </button>
          <button className="beggar-btn primary" disabled={busy} onClick={handleSubmit}>
            {busy ? '…' : 'Dilenci Ol'}
          </button>
        </div>
      </div>
    </div>
  );
}

function BeggarCard({ beggar, myUid }) {
  const [donateOpen, setDonateOpen] = useState(false);
  const [amount, setAmount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleDonate = async () => {
    if (!amount) return;
    setBusy(true);
    setError(null);
    try {
      await donateToBeggar(beggar.id, amount);
      setSuccess(true);
      setAmount(0);
      setTimeout(() => setSuccess(false), 2500);
    } catch (err) {
      setError(err.message || 'Bağış yapılamadı.');
    } finally {
      setBusy(false);
    }
  };

  const isMe = beggar.id === myUid;

  return (
    <div className="beggar-card">
      <div className="beggar-card-top">
        <AvatarSvg avatar={beggar.avatar} size={36} rounded />
        <div className="beggar-card-info">
          <span className="beggar-card-name">{beggar.displayName}</span>
          <span className="beggar-card-earned">
            Bugün kazandığı: {(beggar.todayEarned || 0).toLocaleString('tr-TR')} altın
          </span>
        </div>
        {!isMe && (
          <button className="beggar-donate-btn" onClick={() => setDonateOpen((v) => !v)}>
            Bağış Yap
          </button>
        )}
      </div>
      {beggar.note && <p className="beggar-card-note">"{beggar.note}"</p>}

      {donateOpen && (
        <div className="beggar-donate-panel">
          <QuantityStepper value={amount} onChange={setAmount} quickAmounts={[10, 100, 1000]} />
          <button className="beggar-btn primary" disabled={busy || !amount} onClick={handleDonate}>
            {busy ? '…' : `Bağışla — ${amount.toLocaleString('tr-TR')} altın`}
          </button>
          {success && <p className="beggar-success">Bağışın gönderildi! 🎉</p>}
          {error && <p className="beggar-error">{error}</p>}
        </div>
      )}
    </div>
  );
}

function BeggarsSection() {
  const { user } = useAuth();
  const { beggars } = useBeggars();
  const [showForm, setShowForm] = useState(false);

  const amIBeggar = beggars.some((b) => b.id === user?.uid);

  return (
    <div className="mosque-beggars">
      <div className="mosque-beggars-header">
        <p className="mosque-congregation-title">Dilenciler ({beggars.length})</p>
        {user && !amIBeggar && (
          <button className="beggar-become-btn" onClick={() => setShowForm(true)}>
            Dilenci Ol +
          </button>
        )}
      </div>

      {beggars.length === 0 && <p className="mosque-hint">Bugün hiç dilenci yok.</p>}
      <div className="beggar-list">
        {beggars.map((b) => (
          <BeggarCard key={b.id} beggar={b} myUid={user?.uid} />
        ))}
      </div>

      {showForm && (
        <BecomeBeggarForm onClose={() => setShowForm(false)} onDone={() => {}} />
      )}
    </div>
  );
}

export default function MosqueScreen() {
  const { members, window: win } = useMosqueAttendance();
  const [congregationOpen, setCongregationOpen] = useState(false);

  return (
    <div className="mosque-screen">
      <SimpleActionScreen
        signInMessage="İbadet etmek için giriş yapmalısın."
        description={`Günde 5 vakit (${WINDOW_HOURS[win]} şu an ${win}. vakit) ibadet ederek her seferinde şüpheni 5 azaltabilirsin. Ücretsiz.`}
        buttonLabel="İbadet Et (Şüphe -5)"
        doneLabel="Bu vakitte zaten ibadet ettin"
        isDone={(actions) => Boolean(actions.prayedWindows?.[win])}
        actionFn={prayAtMosque}
      />

      <div className="mosque-congregation">
        <button
          className="mosque-congregation-toggle"
          onClick={() => setCongregationOpen((v) => !v)}
        >
          <span className="mosque-congregation-title">
            {win}. Vakitteki Cemaat ({members.length})
          </span>
          <span className="mosque-congregation-chevron">{congregationOpen ? '▲' : '▼'}</span>
        </button>
        {congregationOpen && (
          <div className="mosque-congregation-list">
            {members.length === 0 && <p className="mosque-hint">Bu vakitte henüz ibadet eden yok.</p>}
            {members.map((m) => (
              <div key={m.id} className="mosque-member">
                <AvatarSvg avatar={m.avatar} size={30} rounded />
                <span>{m.displayName}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <BeggarsSection />
    </div>
  );
}
