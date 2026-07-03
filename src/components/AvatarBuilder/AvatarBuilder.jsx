import { useEffect, useRef, useState } from 'react';
import {
  AVATAR_OPTIONS,
  DEFAULT_AVATAR,
  SKIN_TONES,
  EYE_COLORS,
  HAIR_COLORS,
  CLOTH_COLORS,
  HAT_COLORS,
} from '../../lib/avatarShapes';
import { usePlayer } from '../../hooks/usePlayer';
import { setAvatar, setDisplayName } from '../../services/gameActions';
import AvatarSvg from '../AvatarSvg/AvatarSvg';
import './AvatarBuilder.css';

const OPTION_LABELS = {
  gender: { title: 'Beden Tipi', values: { erkek: 'Erkek', kadin: 'Kadın' } },
  build: { title: 'Vücut Yapısı', values: { zayif: 'Zayıf', standart: 'Standart', iri: 'İri Yarı' } },
  hairStyle: {
    title: 'Saç Stili',
    values: {
      kel: 'Kel', short: 'Kısa', slick: 'Taramalı', wavy: 'Dalgalı', long: 'Uzun',
      mohawk: 'Mohawk', afro: 'Afro', bun: 'Topuz', braids: 'Örgü', undercut: 'Undercut',
    },
  },
  facialHair: {
    title: 'Yüz Kılı',
    values: {
      none: 'Yok', mustache: 'Bıyık', goatee: 'Çene Sakalı', short: 'Kısa Sakal',
      full: 'Gür Sakal', sideburns: 'Favori', vandyke: 'Van Dyke',
    },
  },
  faceAcc: {
    title: 'Yüz Aksesuarı',
    values: {
      none: 'Yok', sunglasses: 'Güneş Gözlüğü', scar: 'Yara İzi', cigar: 'Puro',
      eyepatch: 'Göz Bandı', mask: 'Kar Maskesi', monocle: 'Monokl',
    },
  },
  earring: { title: 'Küpe', values: { yok: 'Yok', sol: 'Sol Kulak', sag: 'Sağ Kulak', cift: 'Çift Kulak' } },
  tattoo: {
    title: 'Dövme',
    values: { yok: 'Yok', gozyasi: 'Gözyaşı', yildiz: 'Yıldız', boyunsembol: 'Boyun Sembolü', boyunyazi: 'Boyun Yazısı' },
  },
  clothing: {
    title: 'Kombin',
    values: {
      suit: 'Takım Elbise', tuxedo: 'Smokin', leather: 'Deri Mont', hawaii: 'Casino Gömleği',
      jumpsuit: 'İşçi Tulumu', hoodie: 'Kapüşonlu', police: 'Polis Üniforması', vest: 'Yelek',
    },
  },
  neckAcc: {
    title: 'Boyun Aksesuarı',
    values: { none: 'Yok', tie: 'Kravat', bow: 'Papyon', chain: 'Altın Zincir', scarf: 'Atkı', dogtag: 'Künye' },
  },
  hat: {
    title: 'Baş Aksesuarı',
    values: {
      none: 'Yok', fedora: 'Fötr Şapka', beret: 'Bere', bandana: 'Bandana', cap: 'Kasket',
      crown: 'Patron Tacı', tophat: 'Silindir Şapka', hoodup: 'Kapüşon (Kapalı)', helmet: 'Motor Kaskı', policecap: 'Polis Şapkası',
    },
  },
  heldItem: {
    title: 'Elde Taşınan',
    values: { yok: 'Yok', tabanca: 'Tabanca', bicak: 'Bıçak', sopa: 'Beyzbol Sopası', para: 'Para Destesi', canta: 'Çanta' },
  },
};

const COLOR_GROUPS = {
  skin: { title: 'Ten Tonu', colors: SKIN_TONES },
  eyeColor: { title: 'Göz Rengi', colors: EYE_COLORS },
  hairColor: { title: 'Saç Rengi', colors: HAIR_COLORS },
  clothColor: { title: 'Kıyafet Rengi', colors: CLOTH_COLORS },
  hatColor: { title: 'Aksesuar Rengi', colors: HAT_COLORS },
};

function OptionRow({ title, values, current, onSelect }) {
  return (
    <div className="avb-row">
      <p className="avb-row-title">{title}</p>
      <div className="avb-opt-grid">
        {Object.entries(values).map(([val, label]) => (
          <button
            key={val}
            className={`avb-opt-btn${current === val ? ' active' : ''}`}
            onClick={() => onSelect(val)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ColorRow({ title, colors, current, onSelect }) {
  return (
    <div className="avb-row">
      <p className="avb-row-title">{title}</p>
      <div className="avb-swatch-grid">
        {colors.map((c) => (
          <button
            key={c}
            className={`avb-swatch${current === c ? ' active' : ''}`}
            style={{ background: c }}
            onClick={() => onSelect(c)}
          />
        ))}
      </div>
    </div>
  );
}

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export default function AvatarBuilder({ onBack }) {
  const { player } = usePlayer();
  const [avatar, setLocalAvatar] = useState(DEFAULT_AVATAR);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(false);

  // player Firestore'dan ASENKRON geliyor — component ilk mount olduğunda
  // henüz yüklenmemiş olabilir. useState'in başlangıç değeri sadece BİR
  // kez okunduğu için, player sonradan gelirse eski koddaki gibi hep
  // DEFAULT_AVATAR'da kalıyordu. Burada player ilk geldiğinde TEK SEFER
  // senkronize ediyoruz; sonraki oturum içi düzenlemeler asla ezilmiyor.
  const syncedOnce = useRef(false);
  useEffect(() => {
    if (!syncedOnce.current && player) {
      if (player.avatar) setLocalAvatar(player.avatar);
      syncedOnce.current = true;
    }
  }, [player]);

  const update = (field, value) => setLocalAvatar((prev) => ({ ...prev, [field]: value }));

  const randomize = () => {
    const next = { ...DEFAULT_AVATAR };
    Object.entries(AVATAR_OPTIONS).forEach(([field, values]) => {
      next[field] = randomFrom(values);
    });
    next.skin = randomFrom(SKIN_TONES);
    next.eyeColor = randomFrom(EYE_COLORS);
    next.hairColor = randomFrom(HAIR_COLORS);
    next.clothColor = randomFrom(CLOTH_COLORS);
    next.hatColor = randomFrom(HAT_COLORS);
    setLocalAvatar(next);
  };

  const handleSave = async () => {
    setBusy(true);
    setError(null);
    setOk(false);
    try {
      await setAvatar(avatar);
      if (name.trim()) {
        await setDisplayName(name.trim());
        setName('');
      }
      setOk(true);
    } catch (err) {
      setError(err.message || 'Kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="avb-builder">
      <div className="avb-sticky-header">
        <button className="avb-header-btn" onClick={onBack}>
          ← Profil
        </button>
        <div className="avb-header-preview">
          <AvatarSvg avatar={avatar} />
        </div>
        <button className="avb-header-btn primary" disabled={busy} onClick={handleSave}>
          {busy ? '…' : '💾 Kaydet'}
        </button>
      </div>

      {ok && <p className="avb-success">Kaydedildi!</p>}
      {error && <p className="avb-error">{error}</p>}

      <button className="avb-random-btn" onClick={randomize}>
        🎲 Rastgele
      </button>

      <div className="avb-row">
        <p className="avb-row-title">Kod Adı (Oyun İçi İsmin)</p>
        <p className="avb-hint">
          Şu anki adın: <strong>{player?.displayName || '—'}</strong>
        </p>
        <input
          type="text"
          className="avb-name-input"
          placeholder="ör. KARA YILMAZ"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
        />
      </div>

      {Object.entries(OPTION_LABELS).map(([field, { title, values }]) => (
        <OptionRow
          key={field}
          title={title}
          values={values}
          current={avatar[field]}
          onSelect={(v) => update(field, v)}
        />
      ))}

      {Object.entries(COLOR_GROUPS).map(([field, { title, colors }]) => (
        <ColorRow
          key={field}
          title={title}
          colors={colors}
          current={avatar[field]}
          onSelect={(v) => update(field, v)}
        />
      ))}
    </div>
  );
}
