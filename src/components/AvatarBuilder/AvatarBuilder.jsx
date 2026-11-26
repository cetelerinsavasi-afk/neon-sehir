import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  AVATAR_OPTIONS,
  DEFAULT_AVATAR,
  SKIN_TONES,
  EYE_COLORS,
  HAIR_COLORS,
  CLOTH_COLORS,
  HAT_COLORS,
  LIP_COLORS,
  BACKGROUND_COLORS,
  PANTS_COLORS,
  SHOE_COLORS,
  BODY_SHAPES,
  bodyShapeOf,
} from '../../lib/avatarShapes';
import { usePlayer } from '../../hooks/usePlayer';
import { setAvatar, setDisplayName } from '../../services/gameActions';
import { Avatar3DView } from '../Avatar3D/Avatar3D';
import { LOOKS } from '../../../functions/cosmeticsData.js';
import { retryImport } from '../../lib/lazyRetry';
import './AvatarBuilder.css';

const CostumeShop = lazy(retryImport(() => import('../CostumeShop/CostumeShop'))); // v212: Kostümler düzenleyicinin içinde
const LOOK_NAME = Object.fromEntries(LOOKS.map((l) => [l.id, l.name]));

const OPTION_LABELS = {
  gender: { title: 'Beden Tipi', values: { erkek: 'Erkek', kadin: 'Kadın' } },
  build: { title: 'Vücut Yapısı (Kalınlık)', values: { zayif: 'İnce', standart: 'Normal', iri: 'Kalın' } },
  // v208: 3D gövde şekli (2D görünümü değiştirmez; şehirde 3D avatarda görünür)
  bodyShape: { title: 'Gövde Şekli', values: { kare: 'Kare', oval: 'Oval' } },
  faceShape: {
    title: 'Kafa Tipi',
    values: {
      oval: 'Oval', round: 'Yuvarlak', square: 'Köşeli', heart: 'Kalp', long: 'Uzun', diamond: 'Elmas',
    },
  },
  eyebrowShape: {
    title: 'Kaş',
    values: {
      straight: 'Düz', arched: 'Kemerli', thick: 'Kalın', thin: 'İnce', angled: 'Çatık', unibrow: 'Çatık Birleşik',
    },
  },
  eyeShape: {
    title: 'Göz Şekli',
    values: {
      almond: 'Badem', round: 'Yuvarlak', narrow: 'Dar', wide: 'İri', hooded: 'Kapaklı', downturned: 'Düşük Köşeli',
    },
  },
  eyelash: {
    title: 'Kirpik',
    values: { none: 'Yok', natural: 'Doğal', long: 'Uzun', dramatic: 'Gösterişli' },
  },
  noseShape: {
    title: 'Burun',
    values: {
      small: 'Küçük', straight: 'Düz', wide: 'Geniş', button: 'Ufak Yuvarlak', aquiline: 'Kemerli', flat: 'Basık',
    },
  },
  mouthShape: {
    title: 'Ağız Yapısı',
    values: {
      neutral: 'Nötr', smile: 'Gülümseyen', smirk: 'Yan Gülüş', full: 'Dolgun', thin: 'İnce', open: 'Aralık',
    },
  },
  hairStyle: {
    title: 'Saç Stili',
    values: {
      kel: 'Kel', short: 'Kısa', slick: 'Taramalı', wavy: 'Dalgalı', long: 'Uzun',
      mohawk: 'Mohawk', afro: 'Afro', bun: 'Topuz', braids: 'Örgü', undercut: 'Undercut',
      ponytail: 'At Kuyruğu', curly: 'Kıvırcık', pixie: 'Pixie Kesim',
    },
  },
  facialHair: {
    title: 'Yüz Kılı',
    values: {
      none: 'Yok', mustache: 'Bıyık', goatee: 'Çene Sakalı', short: 'Kısa Sakal',
      full: 'Gür Sakal', sideburns: 'Favori', vandyke: 'Van Dyke',
      chinstrap: 'Çene Bandı Sakal', horseshoe: 'At Nalı Bıyık',
    },
  },
  faceAcc: {
    title: 'Yüz Aksesuarı',
    values: {
      none: 'Yok', sunglasses: 'Güneş Gözlüğü', scar: 'Yara İzi', cigar: 'Puro',
      eyepatch: 'Göz Bandı', mask: 'Kar Maskesi', monocle: 'Monokl',
      freckles: 'Çil', piercing: 'Piercing',
    },
  },
  earring: { title: 'Küpe', values: { yok: 'Yok', sol: 'Sol Kulak', sag: 'Sağ Kulak', cift: 'Çift Kulak' } },
  tattoo: {
    title: 'Dövme',
    values: {
      yok: 'Yok', gozyasi: 'Gözyaşı', yildiz: 'Yıldız', boyunsembol: 'Boyun Sembolü',
      boyunyazi: 'Boyun Yazısı', yuzsembol: 'Yüz Sembolü', kolyazi: 'Boyun Yazısı 2',
    },
  },
  clothing: {
    title: 'Kombin',
    values: {
      suit: 'Takım Elbise', tuxedo: 'Smokin', leather: 'Deri Mont', hawaii: 'Casino Gömleği',
      jumpsuit: 'İşçi Tulumu', hoodie: 'Kapüşonlu', police: 'Polis Üniforması', vest: 'Yelek',
      tanktop: 'Atlet', trenchcoat: 'Pardösü',
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
      crown: 'Patron Tacı', tophat: 'Silindir Şapka', hoodup: 'Kapüşon (Kapalı)', helmet: 'Motor Kaskı',
      policecap: 'Polis Şapkası', beanie: 'Bere (Yünlü)', headband: 'Kafa Bandı',
    },
  },
  heldItem: {
    title: 'Elde Taşınan',
    values: {
      yok: 'Yok', tabanca: 'Tabanca', bicak: 'Bıçak', sopa: 'Beyzbol Sopası', para: 'Para Destesi',
      canta: 'Çanta', telefon: 'Telefon', kadeh: 'Kadeh',
    },
  },
  shoeStyle: {
    title: 'Ayakkabı Modeli',
    values: { klasik: 'Klasik', spor: 'Spor', bot: 'Bot', sandalet: 'Sandalet' },
  },
};

const COLOR_GROUPS = {
  skin: { title: 'Ten Tonu', colors: SKIN_TONES },
  background: { title: 'Arka Plan', colors: BACKGROUND_COLORS },
  eyeColor: { title: 'Göz Rengi', colors: EYE_COLORS },
  lipColor: { title: 'Dudak Rengi', colors: LIP_COLORS },
  hairColor: { title: 'Saç Rengi', colors: HAIR_COLORS },
  clothColor: { title: 'Kıyafet Rengi', colors: CLOTH_COLORS },
  hatColor: { title: 'Aksesuar Rengi', colors: HAT_COLORS },
  pantsColor: { title: 'Pantolon Rengi', colors: PANTS_COLORS },
  shoeColor: { title: 'Ayakkabı Rengi', colors: SHOE_COLORS },
};

// v212 — sekmeler: her sekmede sadece kendi seçenekleri (uzun tek liste yerine)
const TABS = [
  // v217: Kostümler en başta (sonda kalınca oyuncular görmüyordu); açılışta yine Vücut seçili
  { id: 'kostum', icon: '🎭', label: 'Kostümler' },
  { id: 'vucut', icon: '🧍', label: 'Vücut', rows: [['name'], ['option', 'gender'], ['option', 'build'], ['option', 'bodyShape'], ['color', 'skin'], ['color', 'background']] },
  { id: 'yuz', icon: '🙂', label: 'Yüz', rows: [['option', 'faceShape'], ['option', 'eyeShape'], ['color', 'eyeColor'], ['option', 'eyebrowShape'], ['option', 'eyelash'], ['option', 'noseShape'], ['option', 'mouthShape'], ['color', 'lipColor'], ['option', 'tattoo']] },
  { id: 'sac', icon: '💇', label: 'Saç', rows: [['option', 'hairStyle'], ['color', 'hairColor'], ['option', 'facialHair']] },
  { id: 'kiyafet', icon: '👔', label: 'Kıyafet', rows: [['option', 'clothing'], ['color', 'clothColor'], ['color', 'pantsColor'], ['option', 'shoeStyle'], ['color', 'shoeColor'], ['option', 'neckAcc']] },
  { id: 'aksesuar', icon: '🎩', label: 'Aksesuar', rows: [['option', 'hat'], ['color', 'hatColor'], ['option', 'faceAcc'], ['option', 'earring'], ['option', 'heldItem']] },
];
const PREVIEW_POSES = [
  ['idle', 'Dur'],
  ['walk', 'Yürü'],
  ['sit', 'Otur'],
  ['dans', 'Dans'],
];
// avatar alanları: rastgele seçimde SADECE bunlar değişir (kostüm, aksesuar, evcil hayvan korunur)
const COLOR_FIELDS = ['skin', 'background', 'eyeColor', 'lipColor', 'hairColor', 'clothColor', 'hatColor', 'pantsColor', 'shoeColor'];

function OptionRow({ title, values, current, onSelect }) {
  return (
    <section className="avb-row">
      <h4 className="avb-row-title">{title}</h4>
      <div className="avb-opt-grid">
        {Object.entries(values).map(([val, label]) => (
          <button key={val} type="button" className={`avb-opt-btn${current === val ? ' active' : ''}`} aria-pressed={current === val} onClick={() => onSelect(val)}>
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}

function ColorRow({ title, colors, current, onSelect }) {
  return (
    <section className="avb-row">
      <h4 className="avb-row-title">{title}</h4>
      <div className="avb-swatch-grid">
        {colors.map((c) => (
          <button key={c} type="button" className={`avb-swatch${current === c ? ' active' : ''}`} style={{ background: c }} aria-label={`${title} ${c}`} aria-pressed={current === c} onClick={() => onSelect(c)} />
        ))}
      </div>
    </section>
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
  const [tab, setTab] = useState('vucut');
  const [pose, setPose] = useState('idle');
  const [cosOpen, setCosOpen] = useState(false);
  const okT = useRef(0);

  // player Firestore'dan ASENKRON geliyor — ilk geldiğinde TEK SEFER senkronize edilir;
  // sonraki oturum içi düzenlemeler asla ezilmez.
  const syncedOnce = useRef(false);
  useEffect(() => {
    if (!syncedOnce.current && player) {
      if (player.avatar) setLocalAvatar(player.avatar);
      syncedOnce.current = true;
    }
  }, [player]);
  // kostüm ekranında kuşanılan / çıkarılan kostüm düzenleyiciye de yansısın (diğer alanlar korunur)
  useEffect(() => {
    if (!syncedOnce.current) return;
    setLocalAvatar((prev) => {
      const nx = { ...prev, look: player?.avatar?.look, lookTint: player?.avatar?.lookTint };
      if (!nx.look) delete nx.look;
      if (!nx.lookTint) delete nx.lookTint;
      return nx;
    });
  }, [player?.avatar?.look, player?.avatar?.lookTint]);
  useEffect(() => () => clearTimeout(okT.current), []);

  const update = (field, value) => {
    setOk(false);
    setLocalAvatar((prev) => ({ ...prev, [field]: value }));
  };

  // v212 düzeltme: eskiden { ...DEFAULT_AVATAR } ile başlıyordu → kaydedince kuşanılı kostüm,
  // aksesuarlar ve evcil hayvan da siliniyordu. Artık sadece görünüm seçenekleri karışır.
  const randomize = () => {
    setOk(false);
    setLocalAvatar((prev) => {
      const next = { ...prev };
      Object.entries(AVATAR_OPTIONS).forEach(([field, values]) => {
        next[field] = randomFrom(values);
      });
      const pal = { skin: SKIN_TONES, background: BACKGROUND_COLORS, eyeColor: EYE_COLORS, lipColor: LIP_COLORS, hairColor: HAIR_COLORS, clothColor: CLOTH_COLORS, hatColor: HAT_COLORS, pantsColor: PANTS_COLORS, shoeColor: SHOE_COLORS };
      COLOR_FIELDS.forEach((f) => (next[f] = randomFrom(pal[f])));
      next.bodyShape = randomFrom(BODY_SHAPES);
      return next;
    });
  };

  const dirty = useMemo(() => {
    const base = player?.avatar || DEFAULT_AVATAR;
    const keys = new Set([...Object.keys(OPTION_LABELS), ...COLOR_FIELDS]);
    return [...keys].some((k) => (avatar[k] ?? null) !== (base[k] ?? null)) || Boolean(name.trim());
  }, [avatar, player?.avatar, name]);

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
      clearTimeout(okT.current);
      okT.current = setTimeout(() => setOk(false), 2500);
    } catch (err) {
      setError(err.message || 'Kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  };

  // düzenlenen her zaman kendi görünümü (kostüm giyiliyse kostümsüz hali gösterilir)
  const editAvatar = useMemo(() => {
    if (!avatar?.look) return avatar;
    const a = { ...avatar };
    delete a.look;
    delete a.lookTint;
    return a;
  }, [avatar]);
  const cur = TABS.find((t) => t.id === tab) || TABS[0];
  const accParts = [avatar?.acc?.head && 'şapka', avatar?.acc?.face && 'yüz aksesuarı', avatar?.acc?.neck && 'boyun aksesuarı'].filter(Boolean);

  const pickTab = (id) => {
    if (id === 'kostum') {
      setCosOpen(true);
      return;
    }
    setTab(id);
  };

  return (
    <div className="avb-builder">
      <header className="avb-topbar">
        <button type="button" className="avb-icon-btn" onClick={onBack} aria-label="Profile dön">
          ←
        </button>
        <h2 className="avb-title">Avatarım</h2>
        <button type="button" className={`avb-save${dirty ? ' dirty' : ''}`} disabled={busy || (!dirty && !ok)} onClick={handleSave}>
          {busy ? 'Kaydediliyor…' : ok ? '✓ Kaydedildi' : 'Kaydet'}
        </button>
      </header>

      <div className="avb-stage" style={{ '--avb-bg': editAvatar?.background || '#1a1f35' }}>
        {/* kostüm ekranı açıkken önizleme durur (telefon iki 3D sahneyi aynı anda çizmesin) */}
        {!cosOpen && <Avatar3DView avatar={editAvatar} pose={pose} />}
        <div className="avb-poses" role="group" aria-label="Önizleme pozu">
          {PREVIEW_POSES.map(([k, n]) => (
            <button key={k} type="button" className={pose === k ? 'on' : ''} aria-pressed={pose === k} onClick={() => setPose(k)}>
              {n}
            </button>
          ))}
        </div>
        <button type="button" className="avb-dice" onClick={randomize} aria-label="Rastgele avatar" title="Rastgele">
          🎲
        </button>
        <span className="avb-drag">↔ Çevirmek için yana kaydır</span>
      </div>

      {avatar?.look && (
        <div className="avb-note cos">
          <span>
            🎭 <b>{LOOK_NAME[avatar.look] || 'Kostüm'}</b> giyiyorsun. Burada kendi görünümünü düzenliyorsun; kostümü çıkarınca bu görünür.
          </span>
          <button type="button" onClick={() => setCosOpen(true)}>
            Kostümler
          </button>
        </div>
      )}
      {accParts.length > 0 && <p className="avb-note">🐾 Takılı aksesuarın var ({accParts.join(', ')}). Bu yuvalardaki seçimin, aksesuarı çıkarınca görünür (Profil › Aksesuarlar).</p>}
      {error && <p className="avb-error">{error}</p>}

      <nav className="avb-tabs" role="tablist" aria-label="Avatar kategorileri">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id && t.id !== 'kostum'} className={`avb-tab${tab === t.id ? ' on' : ''}${t.id === 'kostum' ? ' cos' : ''}`} onClick={() => pickTab(t.id)}>
            <span aria-hidden="true">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>

      <div className="avb-panel" role="tabpanel">
        {(cur.rows || []).map(([type, field]) => {
          if (type === 'name') {
            return (
              <section className="avb-row" key="name">
                <h4 className="avb-row-title">Kod adı (oyun içi ismin)</h4>
                <input type="text" className="avb-name-input" placeholder={player?.displayName || 'ör. KARA YILMAZ'} value={name} onChange={(e) => setName(e.target.value)} maxLength={20} aria-label="Yeni kod adı" />
              </section>
            );
          }
          if (type === 'option') {
            const { title, values } = OPTION_LABELS[field];
            return <OptionRow key={field} title={title} values={values} current={field === 'bodyShape' ? bodyShapeOf(avatar) : avatar[field]} onSelect={(v) => update(field, v)} />;
          }
          const { title, colors } = COLOR_GROUPS[field];
          return <ColorRow key={field} title={title} colors={colors} current={avatar[field]} onSelect={(v) => update(field, v)} />;
        })}
      </div>

      {cosOpen && (
        <Suspense fallback={<div className="app-lazy-fallback" aria-busy="true"><span /></div>}>
          <CostumeShop onBack={() => setCosOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}
