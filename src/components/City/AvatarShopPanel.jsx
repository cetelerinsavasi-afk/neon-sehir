import { useEffect, useMemo, useRef, useState } from 'react';
import { avatarShopAction, cosmeticsAction } from '../../services/gameActions';
import { PETS, ACCESSORIES, ACC_SLOTS, RARITY, priceOf, LOOKS, LOOK_CATS } from '../../../functions/cosmeticsData.js';
import { drawPet } from '../../lib/cosmeticsArt.js';
import { DEFAULT_AVATAR, buildFullAvatarSvgMarkup, buildAvatarSvgInner, SKIN_TONES, EYE_COLORS, LIP_COLORS, HAIR_COLORS, CLOTH_COLORS, HAT_COLORS, PANTS_COLORS, SHOE_COLORS, bodyShapeOf } from '../../lib/avatarShapes';
import { AV_SHOP_FIELDS, avFieldPrice, avShopQuote } from '../../../functions/avatarShopData.js';
import './AvatarShopPanel.css';

// =============================================================================
// v219 — ŞEHİRDEKİ GÖRÜNÜM DÜKKÂNLARI. Dükkânın içine girince açılır; seçilen her şey üstünde denenir
// (şehirdeki avatar anında değişir), "Satın al" deyince sunucuda ücreti alınır (avatarShopAction).
// Dükkândan çıkınca / kapatınca denenen geri alınır. Kostümcü ve aksesuarcının "Özel / Evcil" bölümü
// zümrütle satan eski mağazalardır (CostumeShop / AccessoryShop).
// =============================================================================
// zümrüt mağazaları gerektiğinde yüklenir (şehrin açılışına yük olmasın)
const LOADERS = { kostum: () => import('../CostumeShop/CostumeShop') };
function FullShop({ kind, onBack }) {
  const [C, setC] = useState(null);
  useEffect(() => {
    let live = true;
    LOADERS[kind]?.()
      .then((m) => live && setC(() => m.default))
      .catch(() => live && onBack?.());
    return () => {
      live = false;
    };
  }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps
  return C ? <C onBack={onBack} /> : <div className="avs-load">…</div>;
}

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');

const OL = {
  gender: ['Beden Tipi', { erkek: 'Erkek', kadin: 'Kadın' }],
  build: ['Vücut Yapısı', { zayif: 'İnce', standart: 'Normal', iri: 'Kalın' }],
  bodyShape: ['Gövde Şekli', { kare: 'Kare', oval: 'Oval' }],
  faceShape: ['Kafa Tipi', { oval: 'Oval', round: 'Yuvarlak', square: 'Köşeli Çene', heart: 'Sivri Çene', long: 'Uzun', diamond: 'Elmacık' }],
  eyebrowShape: ['Kaş', { straight: 'Düz', arched: 'Kemerli', thick: 'Kalın', thin: 'İnce', angled: 'Çatık', unibrow: 'Birleşik' }],
  eyeShape: ['Göz Şekli', { almond: 'Badem', round: 'Yuvarlak', narrow: 'Dar', wide: 'İri', hooded: 'Kapaklı', downturned: 'Düşük' }],
  eyelash: ['Kirpik', { none: 'Yok', natural: 'Doğal', long: 'Uzun', dramatic: 'Gösterişli' }],
  noseShape: ['Burun', { small: 'Küçük', straight: 'Düz', wide: 'Geniş', button: 'Ufak', aquiline: 'Kemerli', flat: 'Basık' }],
  mouthShape: ['Ağız', { neutral: 'Nötr', smile: 'Gülümseyen', smirk: 'Yan Gülüş', full: 'Dolgun', thin: 'İnce', open: 'Aralık' }],
  hairStyle: ['Saç Kesimi', { kel: 'Kel', short: 'Kısa', slick: 'Taramalı', wavy: 'Dalgalı', long: 'Uzun', mohawk: 'Mohawk', afro: 'Afro', bun: 'Topuz', braids: 'Örgü', undercut: 'Undercut', ponytail: 'At Kuyruğu', curly: 'Kıvırcık', pixie: 'Pixie' }],
  facialHair: ['Sakal & Bıyık', { none: 'Yok', mustache: 'Bıyık', goatee: 'Keçi Sakal', short: 'Kısa Sakal', full: 'Gür Sakal', sideburns: 'Favori', vandyke: 'Van Dyke', chinstrap: 'Çene Bandı', horseshoe: 'At Nalı' }],
  faceAcc: ['Yüz Aksesuarı', { none: 'Yok', sunglasses: 'Güneş Gözlüğü', scar: 'Yara İzi', cigar: 'Puro', eyepatch: 'Göz Bandı', mask: 'Kar Maskesi', monocle: 'Monokl', freckles: 'Çil', piercing: 'Piercing' }],
  earring: ['Küpe', { yok: 'Yok', sol: 'Sol', sag: 'Sağ', cift: 'Çift' }],
  tattoo: ['Dövme', { yok: 'Yok', gozyasi: 'Gözyaşı', yildiz: 'Yıldız', boyunsembol: 'Boyun Sembolü', boyunyazi: 'Boyun Yazısı', yuzsembol: 'Yüz Sembolü', kolyazi: 'Boyun Yazısı 2' }],
  clothing: ['Kombin', { suit: 'Takım Elbise', tuxedo: 'Smokin', leather: 'Deri Mont', hawaii: 'Casino Gömleği', jumpsuit: 'İşçi Tulumu', hoodie: 'Kapüşonlu', police: 'Polis', vest: 'Yelek', tanktop: 'Atlet', trenchcoat: 'Pardösü' }],
  neckAcc: ['Boyun', { none: 'Yok', tie: 'Kravat', bow: 'Papyon', chain: 'Altın Zincir', scarf: 'Atkı', dogtag: 'Künye' }],
  hat: ['Şapka', { none: 'Yok', fedora: 'Fötr', beret: 'Bere', bandana: 'Bandana', cap: 'Kasket', crown: 'Patron Tacı', tophat: 'Silindir', hoodup: 'Kapüşon', helmet: 'Kask', policecap: 'Polis Şapkası', beanie: 'Yün Bere', headband: 'Kafa Bandı' }],
  heldItem: ['Elde Taşınan', { yok: 'Yok', tabanca: 'Tabanca', bicak: 'Bıçak', sopa: 'Beyzbol Sopası', para: 'Para Destesi', canta: 'Çanta', telefon: 'Telefon', kadeh: 'Kadeh' }],
  shoeStyle: ['Ayakkabı', { klasik: 'Klasik', spor: 'Spor', bot: 'Bot', sandalet: 'Sandalet' }],
};
const CG = {
  skin: ['Ten Rengi', SKIN_TONES],
  eyeColor: ['Göz Rengi', EYE_COLORS],
  lipColor: ['Dudak Rengi', LIP_COLORS],
  hairColor: ['Saç Rengi', HAIR_COLORS],
  clothColor: ['Kıyafet Rengi', CLOTH_COLORS],
  hatColor: ['Şapka Rengi', HAT_COLORS],
  pantsColor: ['Pantolon Rengi', PANTS_COLORS],
  shoeColor: ['Ayakkabı Rengi', SHOE_COLORS],
};
export const AV_SHOP_UI = {
  berber: {
    n: '💈 Berber',
    tabs: [
      ['💇 Saç', ['hairStyle', 'hairColor', 'facialHair']],
      ['🙂 Yüz', ['faceShape', 'eyeShape', 'eyeColor', 'eyebrowShape', 'eyelash', 'noseShape', 'mouthShape', 'lipColor']],
      ['🧍 Vücut', ['gender', 'build', 'bodyShape', 'skin']],
    ],
  },
  giyim: {
    n: '👕 Butik',
    tabs: [
      ['👔 Kıyafet', ['clothing', 'clothColor']],
      ['👖 Alt & Ayakkabı', ['pantsColor', 'shoeStyle', 'shoeColor']],
    ],
  },
  aksesuar: {
    n: '💍 Takı & Şapka', // v219: eski "Aksesuarcı" (yeni aksesuarcı özel ürünleri satar)
    tabs: [
      ['🎩 Takılar', ['hat', 'hatColor', 'faceAcc', 'earring', 'neckAcc']],
      ['✋ Elde', ['heldItem']],
      ['🖋️ Dövme', ['tattoo']],
    ],
  },
  kostum: { n: '🎭 Kostümcü', tabs: 'LOOKS' },
  // v219: profildeki evcil hayvan ve aksesuar mağazası şehre taşındı (zümrüt / altın, eski fiyatlar)
  petshop: { n: '🐾 Petshop', tabs: [['🐾 Evcil Hayvanlar', 'PETS']] },
  ozel: { n: '✨ Aksesuarcı', tabs: Object.entries(ACC_SLOTS).map(([sl, nm]) => [nm, `ACC:${sl}`]) },
};
const CROP = { head: '66 26 188 200', face: '98 96 124 112', neck: '70 70 180 220', torso: '26 36 268 350', legs: '60 352 200 222', body: '14 22 292 556' };
const FCROP = {
  hairStyle: 'head', hairColor: 'head', facialHair: 'head', faceShape: 'head', hat: 'head', hatColor: 'head', faceAcc: 'head', earring: 'head',
  eyeShape: 'face', eyeColor: 'face', eyebrowShape: 'face', eyelash: 'face', noseShape: 'face', mouthShape: 'face', lipColor: 'face',
  tattoo: 'neck', clothing: 'torso', clothColor: 'torso', neckAcc: 'torso', heldItem: 'body', pantsColor: 'legs', shoeStyle: 'legs', shoeColor: 'legs',
  gender: 'body', build: 'body', bodyShape: 'body', skin: 'body',
};
const ACC_CROP = { head: 'head', face: 'face', neck: 'torso', back: 'body', aura: 'body' };
const RC = (r) => RARITY[r]?.color || '#2c3658';
const priceText = (it) => {
  const p = priceOf(it);
  return p.currency === 'gold' ? `${fmt(p.amount)} altın` : `💎 ${p.amount}`;
};
function PetThumb({ id }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const g = cv.getContext('2d');
    g.clearRect(0, 0, cv.width, cv.height);
    try {
      drawPet(g, id, cv.width / 2, cv.height - 8, 300, { size: 46, live: true });
    } catch {
      /* çizim yok */
    }
  }, [id]);
  return <canvas ref={ref} width={72} height={72} className="avs-pet" />;
}
// kostümün altında kalan temel görünüm (önizleme kartları kostümsüz çizilir)
const baseAv = (av) => ({ ...av, look: null, lookTint: null });
function thumb(av, crop) {
  try {
    return buildFullAvatarSvgMarkup(av, {}).replace(/viewBox="[^"]*"/, `viewBox="${CROP[crop] || CROP.body}" preserveAspectRatio="xMidYMid meet"`);
  } catch {
    return '';
  }
}

// v220: kostümcü artık diğer dükkânlar gibi soldaki küçük panel (tüm ekranı kaplamaz). Kostüm kartının
// resmi bir kez <img>'e çevrilir (100 kartta DOM hafif kalır)
const lookThumbs = new Map();
function lookThumb(id) {
  let v = lookThumbs.get(id);
  if (v) return v;
  try {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 30 300 330"><rect x="0" y="0" width="320" height="400" fill="#141a2e"/>${buildAvatarSvgInner({ look: id })}</svg>`;
    v = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  } catch {
    v = '';
  }
  lookThumbs.set(id, v);
  return v;
}
const LOOK_BY = Object.fromEntries(LOOKS.map((l) => [l.id, l]));

export default function AvatarShopPanel({ shop, player, engine, onClose, flash }) {
  const real = useMemo(() => {
    const a = { ...DEFAULT_AVATAR, ...(player?.avatar || {}) };
    a.bodyShape = bodyShapeOf(a);
    return a;
  }, [player?.avatar]);
  const [want, setWant] = useState(real);
  const [tab, setTab] = useState(0);
  const [busy, setBusy] = useState(false);
  const [full, setFull] = useState(null); // v220: kostümcü artık panelin içinde (tam ekran mağaza açılmaz)
  const [lcat, setLcat] = useState('all');
  const engRef = useRef(engine);
  engRef.current = engine;
  const realRef = useRef(real);
  realRef.current = real;
  const S = AV_SHOP_UI[shop];
  const q = useMemo(() => (AV_SHOP_FIELDS[shop] ? avShopQuote(shop, real, want) : { total: 0, changes: {} }), [shop, real, want]);
  const dirty = q.total > 0;
  const gold = Number(player?.gold || 0);

  // denenen görünüm şehirde üstünde; panel kapanınca gerçek görünüme döner
  useEffect(() => {
    engRef.current?.setAvatar?.(want);
  }, [want]);
  useEffect(() => () => engRef.current?.setAvatar?.(realRef.current), []);
  if (!S) return null;

  const close = () => {
    engRef.current?.setAvatar?.(realRef.current);
    onClose?.();
  };
  const buy = async () => {
    if (!dirty || busy) return;
    setBusy(true);
    try {
      await avatarShopAction({ shop, avatar: q.changes, expect: q.total });
      flash?.(`✓ Yeni görünümün hazır · −${fmt(q.total)}`);
    } catch (e) {
      const m = String(e?.message || '');
      flash?.(m.startsWith('price-changed') ? 'Fiyat değişti, tekrar dene.' : m || 'Satın alınamadı.');
    } finally {
      setBusy(false);
    }
  };
  // satın alınınca oyuncu belgesi güncellenir → yeni gerçek görünüm denenenle aynı olur
  if (full)
    return (
      <div className="avs-full">
        <FullShop kind={full} onBack={() => (full === 'kostum' && S.tabs === 'LOOKS' ? close() : setFull(null))} />
      </div>
    );

  // ---- v220: KOSTÜMCÜ (zümrütle) — kart seç → üstünde dene → satın al / kuşan / çıkar ----
  if (S.tabs === 'LOOKS') {
    const looks = player?.cosmetics?.looks || {};
    const gems = Number(player?.emerald) || 0;
    const sel = want.look && LOOK_BY[want.look] ? LOOK_BY[want.look] : null;
    const worn = real.look || null;
    const list = LOOKS.filter((x) => (lcat === 'all' ? true : lcat === 'sende' ? looks[x.id] : x.cat === lcat));
    const tryLook = (id) => setWant((w) => (id ? { ...w, look: id, lookTint: id === real.look ? real.lookTint : undefined } : { ...w, look: undefined, lookTint: undefined }));
    const lookAct = async (payload, ok) => {
      if (busy) return;
      setBusy(true);
      try {
        await cosmeticsAction(payload);
        flash?.(ok);
      } catch (e) {
        flash?.(e?.message || 'İşlem başarısız.');
      } finally {
        setBusy(false);
      }
    };
    const changed = (want.look || null) !== worn;
    return (
      <div className="avs" onPointerDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
        <div className="avs-hd">
          <h3>{S.n}</h3>
          <span className="avs-gem">💎 {fmt(gems)}</span>
          <button className="avs-x" onClick={close} aria-label="Kapat">
            ✕
          </button>
        </div>
        <div className="avs-tb">
          {[['all', 'Tümü'], ['sende', '✓ Sende'], ...LOOK_CATS.map((c) => [c.id, `${c.icon} ${c.name}`])].map(([id, nm]) => (
            <button key={id} className={lcat === id ? 'on' : ''} onClick={() => setLcat(id)}>
              {nm}
            </button>
          ))}
        </div>
        <div className="avs-body">
          <div className="avs-rw">
            <div className="avs-og">
              <button className={`avs-ocd${!want.look ? ' on' : ''}${!worn ? ' cur' : ''}`} onClick={() => tryLook(null)}>
                <span className="avs-th" dangerouslySetInnerHTML={{ __html: thumb(baseAv(want), 'body') }} />
                <span className="avs-nm">Kendi görünümüm</span>
                <i>{!worn ? 'Üstünde' : 'Ücretsiz'}</i>
              </button>
              {list.map((it) => (
                <button key={it.id} className={`avs-ocd${want.look === it.id ? ' on' : ''}${worn === it.id ? ' cur' : ''}`} style={{ borderColor: RC(it.r) }} onClick={() => tryLook(it.id)}>
                  <img className="avs-limg" src={lookThumb(it.id)} alt="" loading="lazy" decoding="async" />
                  <span className="avs-nm">{it.name}</span>
                  <i>{worn === it.id ? 'Üstünde' : looks[it.id] ? '✓ Sende' : `💎 ${it.gem}`}</i>
                </button>
              ))}
            </div>
            {!list.length && <p className="avs-note">Bu bölümde kostümün yok.</p>}
          </div>
        </div>
        <div className="avs-ft">
          {sel && !looks[sel.id] ? (
            <button className="avs-act pr" disabled={busy || gems < sel.gem} onClick={() => lookAct({ op: 'buy', kind: 'look', id: sel.id }, `🎉 ${sel.name} artık senin!`)}>
              {busy ? '…' : gems < sel.gem ? `Zümrüt yetmiyor · 💎 ${sel.gem}` : `Satın al · 💎 ${sel.gem}`}
            </button>
          ) : sel && changed ? (
            <button className="avs-act pr" disabled={busy} onClick={() => lookAct({ op: 'equip', kind: 'look', id: sel.id }, `${sel.name} kuşanıldı ✓`)}>
              {busy ? '…' : 'Kuşan'}
            </button>
          ) : !sel && worn ? (
            <button className="avs-act pr" disabled={busy} onClick={() => lookAct({ op: 'unequip', kind: 'look' }, 'Kendi görünümüne döndün')}>
              {busy ? '…' : 'Kostümü çıkar'}
            </button>
          ) : (
            <button className="avs-act pr" disabled>
              Bir kostüm seç, üstünde dene
            </button>
          )}
          <button className="avs-act" disabled={!changed || busy} onClick={() => setWant(real)}>
            ↩️ Geri al
          </button>
        </div>
      </div>
    );
  }
  const T = S.tabs[tab] || S.tabs[0];
  const b = baseAv(want);
  // ---- v219: zümrüt / altınla satılan evcil hayvan ve aksesuarlar (üstünde denenir) ----
  const owned = player?.cosmetics || {};
  const premKind = T[1] === 'PETS' ? 'pet' : typeof T[1] === 'string' && T[1].startsWith('ACC:') ? 'acc' : null;
  const slot = premKind === 'acc' ? T[1].slice(4) : null;
  const premList = premKind === 'pet' ? PETS : premKind === 'acc' ? ACCESSORIES.filter((a) => a.slot === slot) : [];
  const selId = premKind === 'pet' ? want.pet?.id || null : premKind === 'acc' ? want.acc?.[slot] || null : null;
  const realId = premKind === 'pet' ? real.pet?.id || null : premKind === 'acc' ? real.acc?.[slot] || null : null;
  const selItem = premList.find((q) => q.id === selId) || null;
  const selOwned = Boolean(selItem && (premKind === 'pet' ? owned.pets?.[selItem.id] : owned.accs?.[selItem.id]));
  const tryOn = (id) =>
    setWant((w) => {
      if (premKind === 'pet') return id ? { ...w, pet: { ...(w.pet || {}), id } } : { ...w, pet: null };
      const acc = { ...(w.acc || {}) };
      if (id) acc[slot] = id;
      else delete acc[slot];
      return { ...w, acc };
    });
  const premAct = async (payload, ok) => {
    if (busy) return;
    setBusy(true);
    try {
      await cosmeticsAction(payload);
      flash?.(ok);
    } catch (e) {
      flash?.(e?.message || 'İşlem başarısız.');
    } finally {
      setBusy(false);
    }
  };
  const premDirty = premKind && (selId || null) !== (realId || null);
  return (
    <div className="avs" onPointerDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
      <div className="avs-hd">
        <h3>{S.n}</h3>
        <button className="avs-x" onClick={close} aria-label="Kapat">
          ✕
        </button>
      </div>
      {want.look && <p className="avs-note">🎭 Üstünde kostüm var; burada aldıkların kostümün altında kalır.</p>}
      <div className="avs-tb">
        {S.tabs.map((t, i) => (
          <button key={t[0]} className={i === tab ? 'on' : ''} onClick={() => setTab(i)}>
            {t[0]}
          </button>
        ))}
      </div>
      <div className="avs-body">
        {premKind && (
          <div className="avs-rw">
            <div className="avs-og">
              {premList.map((it) => {
                const has = premKind === 'pet' ? owned.pets?.[it.id] : owned.accs?.[it.id];
                return (
                  <button key={it.id} className={`avs-ocd${selId === it.id ? ' on' : ''}${realId === it.id ? ' cur' : ''}`} style={{ borderColor: RC(it.r) }} onClick={() => tryOn(it.id)}>
                    {premKind === 'pet' ? <PetThumb id={it.id} /> : <span className="avs-th" dangerouslySetInnerHTML={{ __html: thumb({ ...b, acc: { ...(b.acc || {}), [slot]: it.id } }, ACC_CROP[slot]) }} />}
                    <span className="avs-nm">{it.name}</span>
                    <i>{realId === it.id ? 'Üstünde' : has ? '✓ Sende' : priceText(it)}</i>
                  </button>
                );
              })}
              <button className={`avs-ocd${!selId ? ' on' : ''}`} onClick={() => tryOn(null)}>
                <span className="avs-x0">✕</span>
                <span className="avs-nm">Yok</span>
              </button>
            </div>
          </div>
        )}
        {!premKind &&
          T[1].map((f) => {
            if (OL[f]) {
              const cr = FCROP[f] || 'body';
              return (
                <div className="avs-rw" key={f}>
                  <b>{OL[f][0]}</b>
                  <div className="avs-og">
                    {Object.entries(OL[f][1]).map(([v, l]) => (
                      <button key={v} className={`avs-ocd${want[f] === v ? ' on' : ''}${real[f] === v ? ' cur' : ''}`} onClick={() => setWant((w) => ({ ...w, [f]: v }))}>
                        <span className="avs-th" dangerouslySetInnerHTML={{ __html: thumb({ ...b, [f]: v }, cr) }} />
                        <span className="avs-nm">{l}</span>
                        <i>{real[f] === v ? 'Üstünde' : fmt(avFieldPrice(f, v))}</i>
                      </button>
                    ))}
                  </div>
                </div>
              );
            }
            if (CG[f]?.[1])
              return (
                <div className="avs-rw" key={f}>
                  <b>
                    {CG[f][0]} <em>{fmt(avFieldPrice(f, '#000000'))}</em>
                  </b>
                  <div className="avs-g">
                    {CG[f][1].map((c) => (
                      <button key={c} aria-label={c} className={`avs-sw${want[f] === c ? ' on' : ''}`} style={{ background: c }} onClick={() => setWant((w) => ({ ...w, [f]: c }))} />
                    ))}
                  </div>
                </div>
              );
            return null;
          })}
      </div>
      {premKind ? (
        <div className="avs-ft">
          {selItem && !selOwned ? (
            <button className="avs-act pr" disabled={busy} onClick={() => premAct({ op: 'buy', kind: premKind, id: selItem.id }, '🎉 Satın alındı ve takıldı!')}>
              {busy ? '…' : `Satın al · ${priceText(selItem)}`}
            </button>
          ) : selItem && premDirty ? (
            <button className="avs-act pr" disabled={busy} onClick={() => premAct({ op: 'equip', kind: premKind, id: selItem.id }, '✓ Takıldı')}>
              {busy ? '…' : 'Tak'}
            </button>
          ) : !selItem && realId ? (
            <button className="avs-act pr" disabled={busy} onClick={() => premAct(premKind === 'pet' ? { op: 'unequip', kind: 'pet' } : { op: 'unequip', kind: 'acc', slot }, 'Çıkarıldı')}>
              {busy ? '…' : 'Çıkar'}
            </button>
          ) : (
            <button className="avs-act pr" disabled>
              {premKind === 'pet' ? 'Bir hayvan seç, yanında dene' : 'Bir ürün seç, üstünde dene'}
            </button>
          )}
          <button className="avs-act" disabled={!premDirty || busy} onClick={() => setWant(real)}>
            ↩️ Geri al
          </button>
        </div>
      ) : (
      <div className="avs-ft">
        <button className="avs-act pr" disabled={!dirty || busy || gold < q.total} onClick={buy}>
          {busy ? '…' : dirty ? <>Satın al · {fmt(q.total)} <span className="gold-coin-icon" style={{ width: 12, height: 12 }} /></> : 'Bir şey seç, üstünde dene'}
        </button>
        <button className="avs-act" disabled={!dirty || busy} onClick={() => setWant(real)}>
          ↩️ Geri al
        </button>
      </div>
      )}
      {dirty && gold < q.total && <p className="avs-note">Altının yetmiyor.</p>}
    </div>
  );
}
