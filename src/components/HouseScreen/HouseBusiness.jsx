import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import {
  BIZ_TYPES,
  BIZ_TYPE_KEYS,
  BIZ_ITEM_LABELS,
  BIZ_MATERIALS,
  bizDayKey,
  prevDayKey,
  checkBizRequirements,
  bizMissing,
} from '../../../functions/businessCatalogData.js';
import HoldButton from '../HoldButton/HoldButton';
import { ShopPriceSection, ShopInvSection } from '../Shop/ShopOwnerPanels';
import { MenuPriceSection, MenuInvSection, NetPriceSection, NetInvSection } from '../Venue/VenueOwnerPanels';
import { GymPriceSection, GymInvSection } from '../Gym/GymOwnerPanels';
import './HouseBusiness.css';

// =============================================================================
// v77 — Ev → İşletme arayüzü (HouseScreen içinde)
//   BizListPanel    : ⚙️ Ayarlar › İşletmeler — tüm türler, gerekli mobilyalar
//                     (yerleşen ✓, eksik soluk), hepsi tamamsa "Aç"
//   BizSettings     : işletme açıkken "ev türü" yerine — Fiyatlar / Envanter / Rapor
//   BizRemovePanel  : gerekli mobilyayı kaldırırken: kilitliyse 🔒 (içerideki kişi
//                     / bitmemiş hizmet), değilse kapanış + iade, basılı tutarak onay
// Yazısız tasarım: kısa etiket + sayı + ikon; uzun açıklama yok.
// =============================================================================

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');
const hhmm = (ms) => new Date(ms).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });

function ReqChip({ g }) {
  const key = g.any[0];
  const lab = BIZ_ITEM_LABELS[key] || { name: key, icon: '📦' };
  const alts = g.any.slice(1).map((k) => BIZ_ITEM_LABELS[k]?.name || k);
  const title = `${[lab.name, ...alts].join(' / ')} — ${g.have}/${g.n}`;
  return (
    <span className={`hb-chip ${g.ok ? 'cue-done ok' : 'cue-dim'}`} title={title}>
      <span className="hb-chip-ico">{lab.icon}</span>
      <b>
        {g.have}/{g.n}
      </b>
    </span>
  );
}

export function BizListPanel({ items, invItems, houseDoc, busy, onOpenBiz, onCloseBiz, onFillMissing, onClose, flashType }) {
  const open = houseDoc?.biz?.type || null;
  const intent = houseDoc?.bizIntent || null;
  const order = [...BIZ_TYPE_KEYS].sort((a, b) => {
    const w = (k) => (k === open ? 0 : k === intent ? 1 : 2);
    return w(a) - w(b);
  });
  return (
    <div className="hs-modal-bg" onClick={() => !busy && onClose()}>
      <div className="hs-modal hb-list" onClick={(e) => e.stopPropagation()}>
        <div className="hs-modal-head">
          <b>🏪 İşletmeler</b>
          <button className="hs-x" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="hb-rows">
          {order.map((type) => {
            const t = BIZ_TYPES[type];
            const req = checkBizRequirements(type, items);
            const isOpen = open === type;
            const blocked = Boolean(open) && !isOpen;
            const ready = req.ok && !open;
            return (
              <div key={type} className={`hb-row${isOpen ? ' open' : ''}${blocked ? ' cue-dim' : ''}${flashType === type ? ' cue-ring cue-shake' : ''}`}>
                <div className="hb-row-head">
                  <span className="hb-type-ico">{t.icon}</span>
                  <b>{t.label}</b>
                  {isOpen && <span className="hb-open-badge">● Açık</span>}
                </div>
                <div className="hb-chips">
                  {req.groups.map((g) => (
                    <ReqChip key={g.any.join('|')} g={g} />
                  ))}
                </div>
                {!open && !req.ok && onFillMissing && (() => {
                  // eksikler: envanterdekiler yerleşir, kalanlar sepete (en ucuz seçenek)
                  const m = bizMissing(type, items, invItems);
                  const nPlace = Object.values(m.place).reduce((a, b) => a + b, 0);
                  const nBuy = Object.values(m.buy).reduce((a, b) => a + b, 0);
                  return (
                    <button className={`hs-btn ghost hb-fill${type === intent ? ' cue-pulse' : ''}`} disabled={busy} onClick={() => onFillMissing(type, m)}>
                      {nBuy > 0 ? `🛒 Hepsini al · ${nBuy}` : '📦 Yerleştir'}
                      {nPlace > 0 && nBuy > 0 && <i> · 📦{nPlace}</i>}
                      {m.gold > 0 && (
                        <span className="hb-fill-cost">
                          <span className="gold-coin-icon" style={{ width: 12, height: 12 }} /> {fmt(m.gold)}
                        </span>
                      )}
                      {m.gem > 0 && (
                        <span className="hb-fill-cost">
                          <span className="emerald-icon" style={{ width: 12, height: 12 }} /> {fmt(m.gem)}
                        </span>
                      )}
                    </button>
                  );
                })()}
                {isOpen ? (
                  <HoldButton className="hs-btn ghost hb-act" disabled={busy} onDone={onCloseBiz}>
                    ✋ Kapat
                  </HoldButton>
                ) : (
                  <button
                    className={`hs-btn gold hb-act${ready ? (type === intent ? ' cue-pulse' : '') : ' cue-dim'}${blocked ? ' cue-lock' : ''}`}
                    disabled={busy || !ready}
                    onClick={() => onOpenBiz(type)}
                  >
                    Aç
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// İşletme günlük raporu (sadece sahibi okuyabilir — firestore.rules)
function useBizDaily(houseId, type) {
  const [today, setToday] = useState(null);
  const [yesterday, setYesterday] = useState(null);
  const todayKey = type ? bizDayKey(type, Date.now()) : null;
  useEffect(() => {
    if (!houseId || !todayKey) return undefined;
    const u1 = onSnapshot(doc(db, 'businessDaily', `${houseId}_${todayKey}`), (s) => setToday(s.exists() ? s.data() : null), () => setToday(null));
    const u2 = onSnapshot(doc(db, 'businessDaily', `${houseId}_${prevDayKey(todayKey)}`), (s) => setYesterday(s.exists() ? s.data() : null), () => setYesterday(null));
    return () => {
      u1();
      u2();
    };
  }, [houseId, todayKey]);
  return { today, yesterday, todayKey };
}

// Türe göre Fiyatlar / Envanter sekmesi içerikleri (Faz 2: silahçı/modifiye/galeri;
// Faz 3-4: cafe/bar/internet/spor)
const BIZ_PRICE_SECTIONS = {
  silahci: ShopPriceSection,
  modifiye: ShopPriceSection,
  galeri: ShopPriceSection,
  cafe: MenuPriceSection,
  bar: MenuPriceSection,
  internet: NetPriceSection,
  spor: GymPriceSection,
};
const BIZ_INV_SECTIONS = {
  silahci: ShopInvSection,
  modifiye: ShopInvSection,
  galeri: ShopInvSection,
  cafe: MenuInvSection,
  bar: MenuInvSection,
  internet: NetInvSection,
  spor: GymInvSection,
};

const KIND = { service: '🛎️', sale: '🏷️', material: '🔧', labor: '🛠️', menu: '🍽️', team: '⚽' };

function ReportCard({ label, d }) {
  const customers = d ? (Number.isFinite(d.customers) ? d.customers : Object.keys(d.cust || {}).length) : 0;
  const top = d?.products ? Object.entries(d.products).sort((a, b) => b[1] - a[1])[0] : null;
  return (
    <div className="hb-rep">
      <div className="hb-rep-head">{label}</div>
      <div className="hb-rep-big">
        <span className="gold-coin-icon" style={{ width: 15, height: 15 }} />
        {fmt(d?.revenue)}
      </div>
      <div className="hb-rep-row">
        <span>👥</span>
        <b>{fmt(customers)}</b>
      </div>
      {Object.entries(d?.byKind || {})
        .filter(([, v]) => v > 0)
        .map(([k, v]) => (
          <div className="hb-rep-row" key={k}>
            <span>{KIND[k] || '•'}</span>
            <b>{fmt(v)}</b>
          </div>
        ))}
      {d?.bonusRef && (
        <div className={`hb-rep-row${d.bonusRef.on ? ' cue-glow' : ' cue-dim'}`} title={`🏆 ${fmt(d.bonusRef.top)} · ½ ${fmt(d.bonusRef.threshold)}`}>
          <span>🔥</span>
          <b>
            {d.bonusRef.eligible === false
              ? '🆕 ⏳ 19:00'
              : `${fmt(d.bonusRef.yesterday)} ${d.bonusRef.on ? '<' : '≥'} ${fmt(d.bonusRef.threshold)}`}
          </b>
        </div>
      )}
      {top && (
        <div className="hb-rep-row">
          <span>🏆</span>
          <b>
            {top[0]} ×{fmt(top[1])}
          </b>
        </div>
      )}
      {Object.keys(d?.materialsUsed || {}).length > 0 && (
        <div className="hb-rep-row">
          <span>📉</span>
          <b>
            {Object.entries(d.materialsUsed)
              .map(([k, v]) => `${BIZ_MATERIALS[k]?.icon || k}×${fmt(v)}`)
              .join(' ')}
          </b>
        </div>
      )}
    </div>
  );
}


export function BizSettings({ houseId, houseDoc }) {
  const type = houseDoc?.biz?.type;
  const [tab, setTab] = useState('prices');
  const [inv, setInv] = useState(null);
  const { today, yesterday } = useBizDaily(houseId, type);
  useEffect(() => {
    if (!houseId) return undefined;
    return onSnapshot(doc(db, 'businessInventories', houseId), (s) => setInv(s.exists() ? s.data() : null), () => setInv(null));
  }, [houseId]);
  if (!type) return null;
  const t = BIZ_TYPES[type];
  const PriceSection = BIZ_PRICE_SECTIONS[type];
  const materials = Object.entries(inv?.materials || {}).filter(([, n]) => n > 0);
  return (
    <div className="hb-settings">
      {Number.isFinite(houseDoc?.bizRank) && (
        <div className="hb-settings-title" title={t.label}>
          <span className="hb-rank">🏆 #{houseDoc.bizRank}</span>
        </div>
      )}
      <div className="hb-tabs">
        <button className={tab === 'prices' ? 'on' : ''} onClick={() => setTab('prices')}>
          💲 Fiyatlar
        </button>
        <button className={tab === 'inv' ? 'on' : ''} onClick={() => setTab('inv')}>
          📦 Envanter
        </button>
        <button className={tab === 'report' ? 'on' : ''} onClick={() => setTab('report')}>
          📊 Rapor
        </button>
      </div>
      {tab === 'prices' &&
        (PriceSection ? (
          <PriceSection houseId={houseId} houseDoc={houseDoc} inv={inv} />
        ) : (
          <div className="hb-empty">
            <span>💲</span>
            <b>—</b>
          </div>
        ))}
      {tab === 'inv' && BIZ_INV_SECTIONS[type] && (() => {
        const InvSection = BIZ_INV_SECTIONS[type];
        return <InvSection houseId={houseId} houseDoc={houseDoc} inv={inv} />;
      })()}
      {tab === 'inv' && !BIZ_INV_SECTIONS[type] &&
        (materials.length ? (
          <div className="hb-inv">
            {materials.map(([k, n]) => (
              <div className="hb-inv-row" key={k}>
                <span>{BIZ_MATERIALS[k]?.icon || '📦'}</span>
                <span>{BIZ_MATERIALS[k]?.name || k}</span>
                <b>×{fmt(n)}</b>
              </div>
            ))}
          </div>
        ) : (
          <div className="hb-empty">
            <span>📦</span>
            <b>0</b>
          </div>
        ))}
      {tab === 'report' && (
        <div className="hb-reports">
          <ReportCard label="Bugün" d={today} />
          <ReportCard label="Dün" d={yesterday} />
        </div>
      )}
    </div>
  );
}

// Gerekli mobilyayı kaldırma uyarısı
export function BizRemovePanel({ type, status, busy, onConfirm, onCancel }) {
  const t = BIZ_TYPES[type] || { icon: '🏪', label: 'İşletme' };
  const lock = status?.lock;
  const mats = Object.entries(status?.returns?.materials || {}).filter(([, n]) => n > 0);
  const extra = status?.returns || {};
  return (
    <div className="hs-modal-bg" onClick={() => !busy && onCancel()}>
      <div className="hs-modal hb-remove" onClick={(e) => e.stopPropagation()}>
        {!status ? (
          <div className="hs-loading">
            <div className="hs-spinner" />
          </div>
        ) : lock?.locked ? (
          <>
            <div className="hb-remove-hero cue-lock cue-shake">{t.icon}</div>
            <div className="hb-remove-facts">
              {lock.people > 0 && (
                <span className="cue-ring">
                  👤 <b>{lock.people}</b>
                </span>
              )}
              {lock.untilMs > 0 && (
                <span className="cue-ring">
                  ⏳ <b>{hhmm(lock.untilMs)}</b>
                </span>
              )}
            </div>
            <button className="hs-btn wide" onClick={onCancel}>
              Tamam
            </button>
          </>
        ) : (
          <>
            <div className="hb-remove-hero closing">{t.icon}</div>
            <b className="hb-remove-title">{t.label} kapanır</b>
            {(mats.length > 0 || extra.weapons > 0 || extra.vehicles > 0) && (
              <div className="hb-remove-facts">
                <span className="hb-arrow">📦 →</span>
                {mats.map(([k, n]) => (
                  <span key={k}>
                    {BIZ_MATERIALS[k]?.icon || '📦'} <b>{fmt(n)}</b>
                  </span>
                ))}
                {extra.weapons > 0 && (
                  <span className="cue-ring" title="Ömür −1">
                    🔫 <b>{fmt(extra.weapons)}</b> <i className="hb-broken" />
                  </span>
                )}
                {extra.vehicles > 0 && (
                  <span className="cue-ring" title="Ömür −1">
                    🚗 <b>{fmt(extra.vehicles)}</b> <i className="hb-broken" />
                  </span>
                )}
              </div>
            )}
            <div className="hh-modal-row">
              <button className="hs-btn ghost" disabled={busy} onClick={onCancel}>
                Vazgeç
              </button>
              <HoldButton className="hs-btn hb-danger" disabled={busy} onDone={onConfirm}>
                ✋ 📦 Kaldır
              </HoldButton>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
