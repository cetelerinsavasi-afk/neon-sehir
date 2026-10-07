import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import {
  BIZ_TYPES,
  BIZ_TYPE_KEYS,
  BIZ_MATERIALS,
  bizDayKey,
  prevDayKey,
  checkBizRequirements,
  bizMissing,
} from '../../../functions/businessCatalogData.js';
import HoldButton from '../HoldButton/HoldButton';
import BizRequirements, { FillConfirm } from './BizRequirements';
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

// Kısa tanıtım (işletme listesinde)
const BIZ_BLURB = {
  silahci: 'Silah sat, silah tamir et ve geliştir.',
  galeri: 'Arabalarını vitrine koy ve sat.',
  modifiye: 'Araba tamiri, vites ve depo geliştirmesi yap.',
  spor: 'Günlük üyelik sat; oyuncular ve takımlar burada antrenman yapar.',
  internet: 'Dakika ücretiyle oyun cihazı kirala.',
  bar: 'Menündeki içecekleri sat; sahneye piyano koy.',
  cafe: 'Menündeki yiyecek ve içecekleri sat.',
};

export function BizListPanel({ items, invItems, houseDoc, busy, gold = 0, gem = 0, onOpenBiz, onCloseBiz, onFillMissing, onClose, flashType }) {
  const open = houseDoc?.biz?.type || null;
  const intent = houseDoc?.bizIntent || null;
  const order = [...BIZ_TYPE_KEYS].sort((a, b) => {
    const w = (k) => (k === open ? 0 : k === intent ? 1 : 2);
    return w(a) - w(b);
  });
  const [expanded, setExpanded] = useState(open || intent || null);
  const [confirm, setConfirm] = useState(null); // { type, m }
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
            const missing = req.groups.reduce((a, g) => a + Math.max(0, g.n - g.have), 0);
            const isExp = expanded === type;
            const m = !open && !req.ok ? bizMissing(type, items, invItems) : null;
            const nBuy = m ? Object.values(m.buy).reduce((a, b) => a + b, 0) : 0;
            return (
              <div key={type} className={`hb-row2${isOpen ? ' open' : ''}${flashType === type ? ' cue-ring cue-shake' : ''}`}>
                <button className="hb-row2-head" onClick={() => setExpanded(isExp ? null : type)}>
                  <span className="hb-type-ico">{t.icon}</span>
                  <span className="hb-row2-title">
                    <b>{t.label}</b>
                    <small>{BIZ_BLURB[type]}</small>
                  </span>
                  {isOpen ? (
                    <span className="bz-tag ok">● Açık</span>
                  ) : blocked ? (
                    <span className="bz-tag">Başka işletme açık</span>
                  ) : ready ? (
                    <span className="bz-tag ok">✓ Açılmaya hazır</span>
                  ) : (
                    <span className="bz-tag bad">{missing} mobilya eksik</span>
                  )}
                  <span className="hb-row2-arrow">{isExp ? '▴' : '▾'}</span>
                </button>
                {isExp && (
                  <div className="hb-row2-body">
                    <BizRequirements type={type} placedItems={items} invItems={invItems} />
                    {blocked && <p className="bz-note">Önce {BIZ_TYPES[open].label} kapanmalı.</p>}
                    {isOpen ? (
                      <HoldButton className="bz-btn danger wide" disabled={busy} ms={1300} onDone={onCloseBiz}>
                        ✋ Basılı tut: işletmeyi kapat
                      </HoldButton>
                    ) : (
                      !blocked && (
                        <div className="bz-btns">
                          {m && onFillMissing && (
                            <button className="bz-btn ghost" disabled={busy} onClick={() => setConfirm({ type, m })}>
                              {nBuy > 0 ? `🛒 Eksikleri al (${nBuy})` : '📦 Envanterden yerleştir'}
                            </button>
                          )}
                          <button className={`bz-btn gold${ready && type === intent ? ' cue-pulse' : ''}`} disabled={busy || !ready} onClick={() => onOpenBiz(type)}>
                            {ready ? `${t.icon} ${t.label} aç` : 'Önce eksikleri tamamla'}
                          </button>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {confirm && (
          <FillConfirm
            type={confirm.type}
            m={confirm.m}
            gold={gold}
            gem={gem}
            busy={busy}
            onCancel={() => setConfirm(null)}
            onConfirm={async () => {
              const ok = await onFillMissing(confirm.type, confirm.m);
              if (ok !== false) setConfirm(null);
            }}
          />
        )}
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

const KIND = { service: 'Hizmet / üyelik', sale: 'Ürün satışı', material: 'Malzeme satışı', labor: 'İşçilik', menu: 'Menü satışı', team: 'Takım antrenmanı' };

function ReportCard({ label, d, type }) {
  const customers = d ? (Number.isFinite(d.customers) ? d.customers : Object.keys(d.cust || {}).length) : 0;
  const top = d?.products ? Object.entries(d.products).sort((a, b) => b[1] - a[1])[0] : null;
  return (
    <div className="bz-sec">
      <p className="bz-sec-title">{label}</p>
      <div className="bz-row total">
        <span>Toplam kazanç</span>
        <b>
          <span className="gold-coin-icon" style={{ width: 14, height: 14 }} />
          {fmt(d?.revenue)} altın
        </b>
      </div>
      <div className="bz-row">
        <span>Müşteri sayısı</span>
        <b>{fmt(customers)}</b>
      </div>
      {Object.entries(d?.byKind || {})
        .filter(([, v]) => v > 0)
        .map(([k, v]) => (
          <div className="bz-row" key={k}>
            <span>{KIND[k] || k}</span>
            <b>{fmt(v)} altın</b>
          </div>
        ))}
      {top && (
        <div className="bz-row">
          <span>En çok satan</span>
          <b>
            {top[0]} ({fmt(top[1])} adet)
          </b>
        </div>
      )}
      {Object.keys(d?.materialsUsed || {}).length > 0 && (
        <div className="bz-row">
          <span>Harcanan stok</span>
          <b>
            {Object.entries(d.materialsUsed)
              .map(([k, v]) => `${BIZ_MATERIALS[k]?.name || k}: ${fmt(v)}`)
              .join(' · ')}
          </b>
        </div>
      )}
      {type === 'spor' && d?.bonusRef && (
        <p className={d.bonusRef.on ? 'bz-ok' : 'bz-note'}>
          {d.bonusRef.eligible === false
            ? '🔥 Yeni salon: bonus için bir tam gün (bir sonraki 19:00) beklemelisin.'
            : d.bonusRef.on
              ? `🔥 Bugün bonusluyuz! Dünkü kazancın (${fmt(d.bonusRef.yesterday)}) en çok kazananın yarısından (${fmt(d.bonusRef.threshold)}) azdı; üyelerin %10 fazla gelişir.`
              : `Bugün bonus yok: dünkü kazancın (${fmt(d.bonusRef.yesterday)}) bonus sınırının (${fmt(d.bonusRef.threshold)}) üstündeydi.`}
        </p>
      )}
      {!d && <p className="bz-hint">Henüz kayıt yok.</p>}
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
  const InvSection = BIZ_INV_SECTIONS[type];
  return (
    <div className="hb-settings bz">
      <div className="bz-row">
        <span>
          {t.icon} {t.label} · açık
        </span>
        {Number.isFinite(houseDoc?.bizRank) && <b>Dünkü kazanç sıralaması: {houseDoc.bizRank}.</b>}
      </div>
      <div className="bz-tabs">
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
      {tab === 'prices' && PriceSection && <PriceSection houseId={houseId} houseDoc={houseDoc} inv={inv} />}
      {tab === 'inv' && InvSection && <InvSection houseId={houseId} houseDoc={houseDoc} inv={inv} />}
      {tab === 'report' && (
        <>
          <p className="bz-hint">Gün {t.day === 'futbol' ? '19:00' : '00:00'}'da kapanır.</p>
          <ReportCard label="Bugün" d={today} type={type} />
          <ReportCard label="Dün" d={yesterday} type={type} />
        </>
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
      <div className="hs-modal hb-remove bz" onClick={(e) => e.stopPropagation()}>
        {!status ? (
          <div className="hs-loading">
            <div className="hs-spinner" />
          </div>
        ) : lock?.locked ? (
          <>
            <div className="bz-head">
              <div className="bz-head-main">
                <h3>🔒 Bu mobilya şu an kaldırılamaz</h3>
                <p>
                  {t.icon} {t.label} için gerekli.
                </p>
              </div>
            </div>
            {lock.people > 0 && <p className="bz-warn">İçeride {lock.people} müşteri var. Müşteriler çıkınca kaldırabilirsin.</p>}
            {lock.untilMs > 0 && <p className="bz-warn">Parası ödenmiş, bitmemiş bir hizmet var (üyelik / antrenman / internet süresi). En geç {hhmm(lock.untilMs)}'de serbest kalır.</p>}
            <button className="bz-btn wide" onClick={onCancel}>
              Tamam
            </button>
          </>
        ) : (
          <>
            <div className="bz-head">
              <div className="bz-head-main">
                <h3>
                  ⚠️ {t.icon} {t.label} kapanacak
                </h3>
                <p>Bu mobilya işletme için gerekli. Kaldırırsan işletme kapanır ve burası yeniden ev olur.</p>
              </div>
            </div>
            {mats.length > 0 || extra.weapons > 0 || extra.vehicles > 0 ? (
              <div className="bz-sec">
                <p className="bz-sec-title">İşletmedekiler sana geri döner</p>
                {mats.map(([k, n]) => (
                  <div className="bz-row" key={k}>
                    <span>
                      {BIZ_MATERIALS[k]?.icon || '📦'} {BIZ_MATERIALS[k]?.name || k}
                    </span>
                    <b>{fmt(n)} adet</b>
                  </div>
                ))}
                {extra.weapons > 0 && (
                  <div className="bz-row">
                    <span>🔫 Vitrindeki silahlar</span>
                    <b className="bz-bad">{fmt(extra.weapons)} adet · ömürleri 1 gün azalır</b>
                  </div>
                )}
                {extra.vehicles > 0 && (
                  <div className="bz-row">
                    <span>🚗 Vitrindeki arabalar</span>
                    <b className="bz-bad">{fmt(extra.vehicles)} adet · ömürleri 1 gün azalır</b>
                  </div>
                )}
              </div>
            ) : (
              <p className="bz-hint">İşletmede stok yok.</p>
            )}
            <div className="bz-btns">
              <button className="bz-btn ghost" disabled={busy} onClick={onCancel}>
                Vazgeç
              </button>
              <HoldButton className="bz-btn danger" disabled={busy} onDone={onConfirm}>
                Basılı tut: kaldır ve kapat
              </HoldButton>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
