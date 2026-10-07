import { BIZ_TYPES, BIZ_ITEM_LABELS, ownedCounts } from '../../../functions/businessCatalogData.js';
import { ITEM_PRICES } from '../../../functions/houseCatalogData.js';
import { CATALOG_MAP } from './houseCatalog';
import ItemThumb from './ItemThumb';
import '../../styles/bizui.css';
import './HouseBusiness.css';

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');

export function PriceText({ price, n = 1 }) {
  if (!price) return <span className="bz-tag">Ücretsiz</span>;
  const v = fmt(price.v * n);
  return price.t === 'gem' ? (
    <span className="bz-gold gem">
      <span className="emerald-icon" style={{ width: 13, height: 13 }} />
      {v} zümrüt
    </span>
  ) : (
    <span className="bz-gold">
      <span className="gold-coin-icon" style={{ width: 13, height: 13 }} />
      {v} altın
    </span>
  );
}

// Bir işletme türünün gerekli mobilyaları: resim, ad, fiyat, seçenekler ve
// (verildiyse) evde / envanterde kaç tane olduğu.
//   placedItems: evdeki eşyalar (p:1 sayılır) · invItems: envanter { key: adet }
export default function BizRequirements({ type, placedItems, invItems, showPlaced = true }) {
  const t = BIZ_TYPES[type];
  if (!t) return null;
  const placed = ownedCounts(placedItems || []);
  const inv = invItems || {};
  // aynı eşya iki şartı karşılamasın (sunucuyla aynı mantık)
  const pool = { ...placed };
  return (
    <div className="bz-list hb-reqs">
      {t.groups.map((g) => {
        let have = 0;
        for (const k of g.any) {
          while (have < g.n && (pool[k] || 0) > 0) {
            pool[k] -= 1;
            have += 1;
          }
        }
        const invN = g.any.reduce((a, k) => a + Math.max(0, Number(inv[k] || 0)), 0);
        const ok = have >= g.n;
        const names = g.any.map((k) => CATALOG_MAP[k]?.name || BIZ_ITEM_LABELS[k]?.name || k);
        return (
          <div key={g.any.join('|')} className={`hb-req${ok ? ' ok' : ''}`}>
            <div className="hb-req-head">
              <b>
                {g.n > 1 ? `${g.n} × ` : ''}
                {g.any.length > 1 ? names.join(' veya ') : names[0]}
              </b>
              {showPlaced && (
                <span className={`bz-tag ${ok ? 'ok' : 'bad'}`}>
                  {ok ? '✓ ' : ''}Evde {have}/{g.n}
                </span>
              )}
            </div>
            {g.any.length > 1 && <small className="hb-req-sub">Bu seçeneklerden herhangi biri olur:</small>}
            <div className="hb-req-opts">
              {g.any.map((k) => {
                const def = CATALOG_MAP[k];
                const lab = BIZ_ITEM_LABELS[k] || {};
                return (
                  <div key={k} className="hb-req-opt">
                    <span className="bz-thumb">
                      <ItemThumb k={k} icon={def?.icon || lab.icon || '📦'} />
                    </span>
                    <span className="bz-item-main">
                      <b>{def?.name || lab.name || k}</b>
                      <small>
                        Fiyatı: <PriceText price={ITEM_PRICES[k]} />
                      </small>
                      {Number(inv[k] || 0) > 0 && <small className="bz-good">Envanterinde {inv[k]} tane var</small>}
                    </span>
                  </div>
                );
              })}
            </div>
            {showPlaced && !ok && invN > 0 && <small className="hb-req-sub bz-good">Envanterindekiler &quot;Eksikleri al&quot; ile odaya konur (ücretsiz).</small>}
          </div>
        );
      })}
    </div>
  );
}

// "Hepsini al" onay ekranı: neler yerleştirilecek / satın alınacak, fiyatlar,
// toplam ve cebindeki para. Onaylamadan hiçbir şey alınmaz.
//   m: bizMissing(...) sonucu · gold/gem: cebindeki · onConfirm / onCancel
export function FillConfirm({ type, m, gold = 0, gem = 0, busy, onConfirm, onCancel, placeNote = true, placeTitle = 'Envanterinden odaya konacaklar (ücretsiz)', note }) {
  const t = BIZ_TYPES[type] || {};
  const buyRows = Object.entries(m.buy || {});
  const placeRows = Object.entries(m.place || {});
  const poorGold = gold < (m.gold || 0);
  const poorGem = gem < (m.gem || 0);
  const nameOf = (k) => CATALOG_MAP[k]?.name || BIZ_ITEM_LABELS[k]?.name || k;
  return (
    <div className="bz-modal-bg" onClick={() => !busy && onCancel()}>
      <div className="bz-modal bz" onClick={(e) => e.stopPropagation()}>
        <div className="bz-head">
          <div className="bz-head-main">
            <h3>
              🛒 {t.icon} {t.label} için eksik mobilyalar
            </h3>
            <p>Onaylamadan hiçbir şey satın alınmaz.{note ? ` ${note}` : ''}</p>
          </div>
          <button className="bz-x" onClick={onCancel} disabled={busy}>
            ✕
          </button>
        </div>
        {buyRows.length > 0 && (
          <div className="bz-sec">
            <p className="bz-sec-title">Satın alınacaklar</p>
            {buyRows.map(([k, n]) => (
              <div key={k} className="bz-item">
                <span className="bz-thumb">
                  <ItemThumb k={k} icon={CATALOG_MAP[k]?.icon || '📦'} />
                </span>
                <span className="bz-item-main">
                  <b>
                    {n} × {nameOf(k)}
                  </b>
                  <small>
                    Tanesi <PriceText price={ITEM_PRICES[k]} />
                  </small>
                </span>
                <PriceText price={ITEM_PRICES[k]} n={n} />
              </div>
            ))}
          </div>
        )}
        {placeRows.length > 0 && placeNote && (
          <div className="bz-sec">
            <p className="bz-sec-title">{placeTitle}</p>
            {placeRows.map(([k, n]) => (
              <div key={k} className="bz-item">
                <span className="bz-thumb">
                  <ItemThumb k={k} icon={CATALOG_MAP[k]?.icon || '📦'} />
                </span>
                <span className="bz-item-main">
                  <b>
                    {n} × {nameOf(k)}
                  </b>
                </span>
                <span className="bz-tag ok">Sende var</span>
              </div>
            ))}
          </div>
        )}
        <div className="bz-sec">
          <div className="bz-row total">
            <span>Toplam</span>
            <b>
              {(m.gold || 0) > 0 && <PriceText price={{ t: 'gold', v: m.gold }} />}
              {(m.gem || 0) > 0 && <PriceText price={{ t: 'gem', v: m.gem }} />}
              {!m.gold && !m.gem && 'Ücretsiz'}
            </b>
          </div>
          <div className="bz-row">
            <span>Cebindeki altın</span>
            <b className={poorGold ? 'bz-bad' : ''}>{fmt(gold)}</b>
          </div>
          <div className="bz-row">
            <span>Cebindeki zümrüt</span>
            <b className={poorGem ? 'bz-bad' : ''}>{fmt(gem)}</b>
          </div>
          {(poorGold || poorGem) && <p className="bz-warn">{poorGold ? 'Altının yetmiyor. ' : ''}{poorGem ? 'Zümrütün yetmiyor (Telefon › Zümrüt Mağazası).' : ''}</p>}
        </div>
        <div className="bz-btns">
          <button className="bz-btn ghost" disabled={busy} onClick={onCancel}>
            Vazgeç
          </button>
          <button className="bz-btn gold" disabled={busy || poorGold || poorGem} onClick={onConfirm}>
            {busy ? 'İşleniyor…' : buyRows.length ? 'Onayla ve satın al' : 'Odaya yerleştir'}
          </button>
        </div>
      </div>
    </div>
  );
}
