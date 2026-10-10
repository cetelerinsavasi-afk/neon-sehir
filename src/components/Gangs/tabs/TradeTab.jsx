// TİCARET — yollar, depo, tırlar, sipariş, depodaki araba/silah/yasaklı madde,
// kasa altını ve yoldaki tüm tırlar (sabotaj / sabotaj talebi).
//  - Sipariş: "Sipariş ver +" → tır seç → sahip olunan yolu seç → galeri /
//    silah mağazası gibi liste (yarı fiyat) ya da yasaklı madde miktarı.
//  - v67: sipariş Pzt–Cmt 00:00–12:00; tır sonraki 3 saatlik dilimde yola çıkar,
//    6 saat ihbar/sabotaj/operasyon penceresi, sonra saldırı, gece 00:00 depoda.
//    Depodaki ürünler anında satılamaz/dağıtılamaz — sadece 2. elde (çete adıyla).
//  - Görünürlük: tırları tüm üyeler görür; sipariş/yük içeriği Kıdemli+.
//    Yönetim (tır/depo al, sipariş, sat/dağıt/2. el) Baba + Sağ Kol.
import { useEffect, useMemo, useState } from 'react';
import { limit, where } from 'firebase/firestore';
import { fmtClock, istDateKey, istHour, istMidnight, nextWindowStart, truckAttackAt, useDocData, useGang, useGangAction, useNow, useQueryData } from '../GangContext';
import { AmountInput, Bar, Btn, Card, Chips, Confirm, Deadline, Empty, Logo, Sheet } from '../ui';
import { DIST_GROUPS, GANG_RULES, LEADERS, PRODUCTS, atLeast, fmt, productOf, unitsOf } from '../gangConstants';
import { itemInfo, itemsFor } from '../itemInfo';
import { nextTradeSunday } from '../tradeSchedule';

const GANG_RULES_HARAC_HOUR_LABEL = '21:00'; // v38: haraç/rüşvet son dilim (21:00) başlayana kadar

// v64: yol kartında büyük sayılar sığsın diye kısa gösterim (ör. 1,2 Mn)
const COMPACT = new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 });
const compact = (n) => (Math.abs(Number(n || 0)) < 10_000 ? fmt(n) : COMPACT.format(Number(n || 0)));

// v71 — 2. el çete ilan reklamı (functions/gang/config.js MARKET_AD_PRICE ile aynı)
const GANG_MARKET_AD_PRICE = 1000;
const adLeftLabel = (ms) => {
  const h = Math.max(0, Math.ceil((Number(ms || 0) - Date.now()) / 3600_000));
  return h <= 1 ? '1 saatten az' : `${h} saat`;
};

const daysBetween = (a, b) => (a && b ? Math.round((istMidnight(b) - istMidnight(a)) / 86400_000) : 0);

function useNextSundayProduct() {
  const { path } = useGang();
  const now = useNow(60_000);
  const { data: world } = useDocData(path('').replace(/\/$/, ''));
  // v50: hesap ortak yardımcıda (Savaş panelindeki geri sayım da kullanır)
  return nextTradeSunday(now, world?.launchDateKey);
}

function Routes({ routes, gangId, state, today }) {
  const next = useNextSundayProduct();
  const byId = Object.fromEntries(routes.map((r) => [r.id, r]));
  return (
    <>
      <div className="gx-section-head">
        <span>🛣️ Ticaret yolları</span>
      </div>
      {next && (
        <div className="gx-next-war">
          ⚔️ {next.today ? 'Bugün' : 'Bu Pazar'}: {next.product.emoji} <b>{next.product.label}</b> savaşı
        </div>
      )}
      <div className="gx-routes">
        {PRODUCTS.map((p) => {
          const r = byId[p.id];
          const mine = r?.holderType === 'gang' && r.holderId === gangId;
          const spent = state?.orderSpent?.dateKey === today ? Number(state.orderSpent.byProduct?.[p.id] || 0) : 0;
          return (
            <div key={p.id} className={`gx-route${mine ? ' mine' : ''}${r?.holderType ? '' : ' empty'}`}>
              <span className="gx-route-emoji">{p.emoji}</span>
              <span className="gx-route-label">{p.label}</span>
              {mine ? (
                // v64: kendi yolumuz — logo/"SİZİN" yok; sade istatistikler
                (() => {
                  const total = Number(r.dailyOrderLimit || 0);
                  const left = Math.max(0, total - spent);
                  const pct = total > 0 ? Math.round((left / total) * 100) : 0;
                  const days = r.untilDateKey ? Math.max(0, daysBetween(today, r.untilDateKey)) : null;
                  return (
                    <div className="gx-route-stats">
                      <div className="gx-route-stat">
                        <span>Günlük limit</span>
                        <b title={`${fmt(left)} / ${fmt(total)}`}>
                          {compact(left)}
                          <i> / {compact(total)}</i>
                        </b>
                      </div>
                      <div className="gx-route-meter" aria-hidden="true">
                        <span style={{ width: `${pct}%` }} />
                      </div>
                      <div className="gx-route-stat">
                        <span>Kalan süre</span>
                        <b>{days == null ? '—' : `${days} gün`}</b>
                      </div>
                    </div>
                  );
                })()
              ) : r?.holderType === 'gang' ? (
                <span className="gx-route-holder">
                  <Logo logo={r.holderLogo} size={16} /> {r.holderName}
                </span>
              ) : (
                <span className="gx-route-holder dim">{r?.lastWinner === 'intel' ? '🕵️ kapatıldı' : 'boş'}</span>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Sipariş ver: tır → yol → ürünler
// ---------------------------------------------------------------------------
function OrderSheet({ trucks, routes, state, depot, gangId, orders, onClose }) {
  const { run, busy } = useGangAction();
  const now = useNow(60_000);
  const today = istDateKey(now);
  const pendingTruck = new Set(orders.filter((o) => o.status === 'pending').map((o) => o.truckId));
  const eligible = trucks.filter((t) => t.status !== 'retired' && daysBetween(today, t.expiresDateKey) >= 2 && !pendingTruck.has(t.id) && !(t.status === 'in_transit' && t.departDateKey === today));
  const departAt = nextWindowStart(now);
  const myRoutes = routes.filter((r) => r.holderType === 'gang' && r.holderId === gangId && (!r.untilDateKey || today < r.untilDateKey));
  const [truckId, setTruckId] = useState(eligible[0]?.id || null);
  const [product, setProduct] = useState(myRoutes[0]?.id || null);
  const [qty, setQty] = useState({});
  // Sınıra takılınca ilgili çubuk kısa süre kırmızı yanar (tır / limit / depo / kasa)
  const [flash, setFlash] = useState({ keys: [], n: 0 });
  useEffect(() => {
    if (!flash.keys.length) return undefined;
    const t = setTimeout(() => setFlash({ keys: [], n: 0 }), 1400);
    return () => clearTimeout(t);
  }, [flash]);
  const blink = (keys) => setFlash({ keys, n: Date.now() });
  const route = myRoutes.find((r) => r.id === product);
  const items = product ? itemsFor(product) : [];
  const half = (key) => Math.floor(itemInfo(key).storePrice / 2);
  const count = Object.values(qty).reduce((a, b) => a + b, 0);
  const units = Object.entries(qty).reduce((a, [k, q]) => a + unitsOf(k, q), 0);
  const cost = Object.entries(qty).reduce((a, [k, q]) => a + q * half(k), 0);
  const cap = GANG_RULES.TRUCK_CAPACITY[product] || 0;
  const spent = state?.orderSpent?.dateKey === today ? Number(state.orderSpent.byProduct?.[product] || 0) : 0;
  const limitLeft = Math.max(0, Number(route?.dailyOrderLimit || 0) - spent);
  const free = Math.max(0, Number(depot?.capacity || 0) - Number(depot?.usedUnits || 0) - Number(depot?.reservedUnits || 0));
  const kasa = Number(state?.kasa || 0);
  const over = count > cap || cost > limitLeft || cost > kasa || units > free;

  // Bir ürün için en fazla adet ve bunu sınırlayan kısıt(lar) (diğer seçimler sabitken)
  const maxFor = (key) => {
    const p = Math.max(1, half(key));
    const u = Math.max(1, unitsOf(key, 1));
    const others = { count: count - (qty[key] || 0), cost: cost - (qty[key] || 0) * half(key), units: units - unitsOf(key, qty[key] || 0) };
    const lims = {
      cap: cap - others.count,
      limit: Math.floor((limitLeft - others.cost) / p),
      depot: Math.floor((free - others.units) / u),
      kasa: Math.floor((kasa - others.cost) / p),
    };
    const m = Math.max(0, Math.min(...Object.values(lims)));
    return { m, binding: Object.keys(lims).filter((k) => lims[k] <= m) };
  };
  const setTo = (key, v) => {
    const { m, binding } = maxFor(key);
    const n = Math.max(0, v);
    if (n > m) blink(binding);
    setQty({ ...qty, [key]: Math.min(n, m) });
  };
  const pressMax = (key) => {
    const { m, binding } = maxFor(key);
    if ((qty[key] || 0) >= m) blink(binding);
    setQty({ ...qty, [key]: m });
  };
  const hot = (k) => flash.keys.includes(k);

  if (eligible.length === 0 || myRoutes.length === 0) {
    return (
      <Sheet title="Sipariş ver" icon="📦" onClose={onClose}>
        <Empty icon={myRoutes.length === 0 ? '🛣️' : '🚚'} text={myRoutes.length === 0 ? 'Ticaret yolunuz yok.' : 'Boşta tır yok.'} />
      </Sheet>
    );
  }
  return (
    <Sheet title="Sipariş ver" icon="📦" onClose={onClose}>
      <div className="gx-order-plan">
        🕒 Kalkış <b>{fmtClock(departAt)}</b> · 🎯 ihbar/sabotaj riski <b>{fmtClock(departAt + 6 * 3600_000)}</b>'e kadar · ⚔️ saldırı {fmtClock(departAt + 6 * 3600_000)}–24:00 · 🏚️ teslim <b>00:00</b>
      </div>
      <Chips options={eligible.map((t) => ({ id: t.id, label: `#${t.code}${t.status === 'in_transit' ? ' 🚛' : ''}`, icon: '🚚' }))} value={truckId} onChange={setTruckId} />
      <Chips
        options={myRoutes.map((r) => ({ id: r.id, label: productOf(r.id).label, icon: productOf(r.id).emoji }))}
        value={product}
        onChange={(p) => {
          setProduct(p);
          setQty({});
        }}
      />
      {product === 'yasakliMadde' ? (
        <div className="gx-shop-row">
          <span className="gx-shop-emoji">💊</span>
          <span className="gx-shop-main">
            Yasaklı Madde
            <span className="dim"> · {fmt(half('yasakliMadde'))}</span>
          </span>
          <div className="gx-amount">
            <div className="gx-amount-row">
              <button type="button" className="gx-amount-step" onClick={() => setTo('yasakliMadde', (qty.yasakliMadde || 0) - 1)} disabled={!qty.yasakliMadde} aria-label="Azalt">
                −
              </button>
              <span className="gx-amount-value">{qty.yasakliMadde || 0}</span>
              <button type="button" className="gx-amount-step" onClick={() => setTo('yasakliMadde', (qty.yasakliMadde || 0) + 1)} aria-label="Artır">
                +
              </button>
            </div>
            <div className="gx-amount-quick">
              {[5, 10, 50].map((q) => (
                <button key={q} type="button" onClick={() => setTo('yasakliMadde', (qty.yasakliMadde || 0) + q)}>
                  +{q}
                </button>
              ))}
              <button type="button" className="max" onClick={() => pressMax('yasakliMadde')}>
                MAX
              </button>
              {qty.yasakliMadde > 0 && (
                <button type="button" className="reset" onClick={() => setTo('yasakliMadde', 0)}>
                  Sıfırla
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="gx-shop">
          {items.map((it) => (
            <div key={it.key} className={`gx-shop-item${qty[it.key] ? ' active' : ''}`}>
              {it.image ? <img src={it.image} alt={it.label} /> : <span className="gx-shop-emoji">{productOf(product).emoji}</span>}
              <span className="gx-shop-name">{it.label}</span>
              <span className="gx-shop-sub dim">{it.sub}</span>
              <span className="gx-shop-price">
                <s className="dim">{fmt(it.storePrice)}</s> <b>{fmt(half(it.key))}</b>
              </span>
              <span className="gx-stepper">
                <button type="button" onClick={() => setTo(it.key, (qty[it.key] || 0) - 1)} disabled={!qty[it.key]}>
                  −
                </button>
                <b>{qty[it.key] || 0}</b>
                <button type="button" onClick={() => setTo(it.key, (qty[it.key] || 0) + 1)}>
                  +
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="gx-limits" key={flash.n}>
        <Bar blocked={hot('cap')} value={count} max={cap} label={`🚛 ${count} / ${cap}`} color="var(--neon-cyan)" />
        <Bar blocked={hot('limit')} value={cost} max={Math.max(1, limitLeft)} label={`📅 ${fmt(cost)} / ${fmt(limitLeft)}`} color="var(--neon-yellow)" />
        <Bar blocked={hot('depot')} value={units} max={Math.max(1, free)} label={`🏚️ ${fmt(units)} / ${fmt(free)}`} color="#7cff6b" />
        <Bar blocked={hot('kasa')} value={cost} max={Math.max(1, kasa)} label={`💰 ${fmt(cost)} / ${fmt(kasa)}`} color="#ffb347" />
      </div>
      <Btn
        block
        disabled={!cost || over || !truckId}
        busy={busy === 'placeOrder'}
        onClick={async () => {
          const payload = { truckId, product, items: Object.fromEntries(Object.entries(qty).filter(([, q]) => q > 0)) };
          const r = await run('placeOrder', payload, { success: '📦 Sipariş verildi', withRequestId: true });
          if (r) onClose();
        }}
      >
        📦 {fmt(cost)}
      </Btn>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Depodaki ürünler: sisteme sat / üyelere dağıt / 2. ele koy
// ---------------------------------------------------------------------------
function DepotItems({ depot, lead, listings }) {
  const { run, busy } = useGangAction();
  const [act, setAct] = useState(null);
  const [qty, setQty] = useState(0);
  const [price, setPrice] = useState(0);
  const [group, setGroup] = useState('rutbeli');
  const [adFor, setAdFor] = useState(null); // v71 — reklam onayı
  const entries = Object.entries(depot?.items || {}).filter(([, q]) => q > 0);
  const groups = [
    { id: 'araba', title: '🚗 Arabalar' },
    { id: 'silah', title: '🔫 Silahlar' },
    { id: 'yasakliMadde', title: '💊 Yasaklı madde' },
  ];
  const open = (type, k, it, free) => {
    setAct({ type, key: k, it, max: free });
    setQty(type === 'list' ? Math.min(1, free) : free);
    setPrice(it.storePrice);
  };
  return (
    <>
      <p className="dim gx-mini">🏪 Depodaki ürünler anında satılamaz ve dağıtılamaz — 2. el pazarında çetenin adıyla satılır, satış parası kasaya girer.</p>
      {groups.map((g) => {
        const rows = entries.filter(([k]) => itemInfo(k).product === g.id);
        return (
          <div key={g.id}>
            <div className="gx-section-head">
              <span>{g.title}</span>
            </div>
            {rows.length === 0 && <p className="dim gx-mini">—</p>}
            {rows.map(([k, q]) => {
              const it = itemInfo(k);
              const listed = Number(depot?.listed?.[k] || 0);
              const free = q - listed;
              return (
                <div key={k} className="gx-depot-row">
                  {it.image ? <img className="gx-depot-img" src={it.image} alt="" /> : <span>{it.emoji}</span>}
                  <span className="gx-depot-name">
                    {it.label}
                    {listed > 0 && <span className="dim"> · 🏷️ {listed} ilanda</span>}
                  </span>
                  <b>{fmt(q)}</b>
                  {lead && free > 0 && (
                    <span className="gx-depot-acts">
                      <Btn small kind="ghost" onClick={() => open('list', k, it, free)}>
                        🏪 2. ele koy
                      </Btn>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
      {listings.length > 0 && (
        <>
          <div className="gx-section-head">
            <span>🏪 2. eldeki ilanlarımız</span>
          </div>
          {listings.map((l) => (
            <div key={l.id} className="gx-depot-row">
              <span className="gx-depot-name">
                {l.label} · {l.quantity} adet × {fmt(l.unitPrice)}
                {l.soldQty > 0 && <span className="dim"> · {l.soldQty} satıldı</span>}
              </span>
              {Number(l.adExpiresAtMs || 0) > Date.now() ? (
                <span className="dim gx-mini">📢 Reklamda · {adLeftLabel(l.adExpiresAtMs)}</span>
              ) : (
                lead && (
                  <Btn small kind="ghost" busy={busy === `ad_${l.id}`} onClick={() => setAdFor(l)}>
                    📢 Reklam
                  </Btn>
                )
              )}
              {lead && (
                <Btn small kind="ghost" busy={busy === `cl_${l.id}`} onClick={() => run('cancelDepotListing', { listingId: l.id }, { key: `cl_${l.id}`, success: 'İlan kaldırıldı' })}>
                  Kaldır
                </Btn>
              )}
            </div>
          ))}
        </>
      )}
      {adFor && (
        <Confirm
          icon="📢"
          title={`${adFor.label} ilanına reklam verilsin mi?`}
          lines={[`💰 ${fmt(GANG_MARKET_AD_PRICE)} altın (çete kasasından)`, '⏱️ 24 saat boyunca 2. El Pazarı\'nda "📢 Reklam Verilen Ürünler" bölümünde görünür.', 'Ücret iade edilmez (ilan satılsa/kaldırılsa da).']}
          confirmLabel="Reklam Ver"
          busy={busy === `ad_${adFor.id}`}
          onCancel={() => setAdFor(null)}
          onConfirm={async () => {
            const r = await run('advertiseDepotListing', { listingId: adFor.id }, { key: `ad_${adFor.id}`, success: '📢 Reklam verildi', withRequestId: true });
            if (r) setAdFor(null);
          }}
        />
      )}
      {act && (
        <Confirm
          icon={act.type === 'sell' ? '🏷️' : act.type === 'dist' ? '🎁' : '🏪'}
          title={act.type === 'sell' ? `${act.it.label} sisteme satılsın mı?` : act.type === 'dist' ? `${act.it.label} dağıtılsın mı?` : `${act.it.label} 2. ele konsun mu?`}
          lines={
            act.type === 'sell'
              ? [`💰 ${fmt(qty * Math.floor(act.it.storePrice / 2))}`]
              : act.type === 'dist'
                ? []
                : [`${fmt(Math.floor(act.it.storePrice / 2))} – ${fmt(act.it.storePrice)}`]
          }
          confirmLabel={act.type === 'sell' ? 'Sat' : act.type === 'dist' ? 'Dağıt' : 'İlana koy'}
          busy={Boolean(busy)}
          onCancel={() => setAct(null)}
          onConfirm={async () => {
            let r;
            if (act.type === 'sell') r = await run('sellFromDepot', { itemKey: act.key, qty }, { success: '🏷️ Satıldı', withRequestId: true });
            else if (act.type === 'dist') r = await run('distributeFromDepot', { itemKey: act.key, qty, group }, { success: '🎁 Dağıtıldı', withRequestId: true });
            else r = await run('listDepotItem', { itemKey: act.key, qty, unitPrice: price }, { success: '🏪 2. ele kondu', withRequestId: true });
            if (r) setAct(null);
          }}
        >
          <span className="dim gx-mini">Adet</span>
          <AmountInput value={qty} onChange={setQty} max={act.max} min={1} quick={[5, 10, 50]} />
          {act.type === 'dist' && <Chips options={DIST_GROUPS.map((g) => ({ id: g.id, label: g.label, icon: g.icon }))} value={group} onChange={setGroup} />}
          {act.type === 'list' && (
            <>
              <span className="dim gx-mini">💰 Adet fiyatı</span>
              <AmountInput value={price} onChange={setPrice} max={act.it.storePrice} min={Math.floor(act.it.storePrice / 2)} quick={[100, 1000, 10_000, 100_000]} />
            </>
          )}
        </Confirm>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Yoldaki tırlar (tüm çeteler): sabotaj (Baba/Sağ Kol) · talep (Kıdemli/Tetikçi)
// ---------------------------------------------------------------------------
function RoadTrucks({ gangId, rank, alliances, wars }) {
  const { path, call } = useGang();
  const { run, busy } = useGangAction();
  const now = useNow();
  const today = istDateKey(now);
  const { docs: road } = useQueryData(path('trucks'), () => [where('status', '==', 'in_transit'), limit(80)], 'road');
  const [target, setTarget] = useState(null);
  const [quote, setQuote] = useState(null);
  const [harac, setHarac] = useState(0);
  // v67: her tırın kendi penceresi (yola çıkış + 6 saat)
  const others = road.filter((t) => t.gangId !== gangId && t.departDateKey === today);
  const openFor = (t) => now < truckAttackAt(t);
  const nearest = others.filter(openFor).map(truckAttackAt).sort((a, b) => a - b)[0] || 0;
  const allied = new Set(alliances.filter((a) => ['accepted', 'active', 'ending'].includes(a.status)).flatMap((a) => a.gangIds));
  // v84: biat (ittifak gibi saldırılamaz) — etikette ayrı gösterilir
  const biatWith = new Set(alliances.filter((a) => a.kind === 'biat' && ['accepted', 'active', 'ending'].includes(a.status)).flatMap((a) => a.gangIds));
  const attacking = new Set(wars.all.filter((w) => w.type === 'sabotage' && w.attackerGangId === gangId).map((w) => w.truckId));
  const lead = LEADERS.includes(rank);
  const canRequest = rank === 'kidemli' || rank === 'tetikci';
  const [quotes, setQuotes] = useState({});

  const loadQuote = async (t) => {
    if (quotes[t.id]) return quotes[t.id];
    const q = await call('quoteSabotage', { truckId: t.id }).catch(() => ({ error: true }));
    setQuotes((s) => ({ ...s, [t.id]: q }));
    return q;
  };
  const pick = async (t) => {
    setTarget(t);
    setHarac(0);
    setQuote(null);
    setQuote(await loadQuote(t));
  };

  return (
    <>
      <div className="gx-section-head">
        <span>🛣️ Yoldaki tırlar ({others.length})</span>
        {nearest > 0 && (lead || canRequest) && <Deadline untilMs={nearest} label="💣" />}
      </div>
      {others.length === 0 && <p className="dim gx-mini">🛣️ Yol boş</p>}
      {others.map((t) => {
        const open = openFor(t);
        return (
        <div key={t.id} className="gx-truck-line">
          <span className="gx-truck-code">🚛 #{t.code}</span>
          <span className="gx-truck-owner">
            <Logo logo={t.gangLogo} size={16} /> {t.gangName}
          </span>
          {!open && !allied.has(t.gangId) && !attacking.has(t.id) && <span className="gx-pill">🔒 {fmtClock(truckAttackAt(t))}</span>}
          {allied.has(t.gangId) ? (
            biatWith.has(t.gangId) ? <span className="gx-pill biat">⛓️ BİAT</span> : <span className="gx-pill ally">🤝 İTTİFAK</span>
          ) : attacking.has(t.id) ? (
            <span className="gx-pill">💣 Hedefte</span>
          ) : open && lead ? (
            <Btn small kind="danger" onClick={() => pick(t)}>
              💣 Sabotaj
            </Btn>
          ) : open && canRequest ? (
            <Btn small kind="ghost" busy={busy === `rq_${t.id}`} onClick={() => run('requestSabotage', { truckId: t.id }, { key: `rq_${t.id}`, success: '📣 Talep sohbete gönderildi' })}>
              📣 Talep
            </Btn>
          ) : null}
        </div>
        );
      })}
      {target && (
        <Confirm
          icon="💣"
          danger
          title={`TIR #${target.code} (${target.gangName}) için sabotaj`}
          lines={
            !quote
              ? ['Hesaplanıyor…']
              : quote.error
                ? ['Teklif alınamadı.']
                : quote.canReceive === false
                  ? ['🏚️ Depoda yer yok']
                  : [`💸 ${fmt(quote.price)} çete kasasından`, `⚔️ Saldırı ${fmtClock(truckAttackAt(target))}–24:00`, `🤑 Tır sahibi haracı ${GANG_RULES_HARAC_HOUR_LABEL}'e kadar ödeyebilir`]
          }
          confirmLabel="Başlat"
          busy={busy === 'startSabotage'}
          onCancel={() => setTarget(null)}
          onConfirm={async () => {
            if (!quote || quote.error || quote.canReceive === false) return setTarget(null);
            const r = await run('startSabotage', { truckId: target.id, harac }, { success: '💣 Sabotaj başlatıldı', withRequestId: true });
            if (r) setTarget(null);
            return r;
          }}
        >
          <div className="gx-confirm-deadline">
            <Deadline untilMs={truckAttackAt(target)} label="içinde başlat" />
          </div>
          {quote && !quote.error && quote.canReceive !== false && (
            <div className="gx-field">
              <span>
                🤑 Haraç
              </span>
              <AmountInput value={harac} onChange={setHarac} placeholder="0" />
            </div>
          )}
        </Confirm>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
export default function TradeTab({ d }) {
  const { path } = useGang();
  const { run, busy } = useGangAction();
  const now = useNow(60_000);
  const today = istDateKey(now);
  const gangId = d.gangId;
  const lead = LEADERS.includes(d.rank);
  const seeCargo = atLeast(d.rank, 'kidemli');
  const { docs: routes } = useQueryData(path('routes'), () => [limit(10)], 'routes');
  const { data: depot } = useDocData(path(`gangs/${gangId}/private/depot`));
  const { docs: trucksAll } = useQueryData(path('trucks'), () => [where('gangId', '==', gangId), limit(80)], `trucks_${gangId}`);
  const { docs: orders } = useQueryData(seeCargo ? path('orders') : null, () => [where('gangId', '==', gangId), limit(100)], `orders_${gangId}_${seeCargo}`);
  const { docs: listingsAll } = useQueryData(path('market'), () => [where('gangId', '==', gangId), limit(50)], `market_${gangId}`);
  const [orderOpen, setOrderOpen] = useState(false);
  const [ask, setAsk] = useState(null);
  const trucks = useMemo(() => trucksAll.filter((t) => t.status !== 'retired').sort((a, b) => (a.code < b.code ? -1 : 1)), [trucksAll]);
  const listings = listingsAll.filter((l) => l.status === 'open');
  const cap = Number(depot?.capacity || 0);
  const used = Number(depot?.usedUnits || 0);
  const reserved = Number(depot?.reservedUnits || 0);
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const orderDay = GANG_RULES.ORDER_WEEKDAYS.includes(weekday) && istHour(now) < GANG_RULES.ORDER_DEADLINE_HOUR;
  // v39: çete günde 1 tır + 1 depo alabilir
  const truckBoughtToday = d.state?.truckBuyDateKey === today;
  const depotBoughtToday = d.state?.depotBuyDateKey === today;
  const nextMidnightMs = istMidnight(today) + 24 * 3600_000;
  const orderOf = (t) => orders.find((o) => o.truckId === t.id && ['pending', 'in_transit'].includes(o.status) && (o.status === 'pending' || o.departedDateKey === t.departDateKey));

  return (
    <div className="gx-stack">
      <Routes routes={routes} gangId={gangId} state={d.state} today={today} />

      <div className="gx-section-head">
        <span>🏚️ Depo</span>
      </div>
      {cap > 0 && <Bar value={used + reserved} max={cap} label={`${fmt(used + reserved)} / ${fmt(cap)}`} />}
      {lead && (
        <Btn small kind="ghost" disabled={depotBoughtToday} onClick={() => setAsk('depot')}>
          {depotBoughtToday ? (
            <>
              🔒 🏚️ <Deadline untilMs={nextMidnightMs} />
            </>
          ) : (
            <>
              🏚️ {cap === 0 ? 'Depo al' : 'Depoyu genişlet'} (+{GANG_RULES.DEPOT_STEP}) · {fmt(GANG_RULES.DEPOT_PRICE)}
            </>
          )}
        </Btn>
      )}

      <div className="gx-section-head">
        <span>🚚 Tırlar ({trucks.length})</span>
      </div>
      {lead && (
        <div className="gx-row-2">
          <Btn small kind="ghost" disabled={truckBoughtToday} onClick={() => setAsk('truck')}>
            {truckBoughtToday ? (
              <>
                🔒 🚚 <Deadline untilMs={nextMidnightMs} />
              </>
            ) : (
              <>🚚 Tır al · {fmt(GANG_RULES.TRUCK_PRICE)}</>
            )}
          </Btn>
          <Btn small disabled={!orderDay} onClick={() => setOrderOpen(true)}>
            {orderDay ? 'Sipariş ver +' : '🔒 Sipariş: Pzt–Cmt 00:00–12:00'}
          </Btn>
        </div>
      )}
            {trucks.map((t) => {
        const o = orderOf(t);
        const life = daysBetween(today, t.expiresDateKey);
        const pend = orders.find((x) => x.truckId === t.id && x.status === 'pending');
        return (
          <Card key={t.id} className="gx-truck">
            <div className="gx-truck-head">
              <span className="gx-truck-code">🚛 #{t.code}</span>
              <span className={t.status === 'in_transit' ? 'gx-pill intel' : 'gx-pill'}>{t.status === 'in_transit' ? '🛣️ Yolda' : '🅿️ Garajda'}</span>
              <span className="dim gx-mini">⏳ {life} gün</span>
            </div>
            <Bar value={Math.max(0, life)} max={GANG_RULES.TRUCK_LIFE_DAYS} height={4} color={life <= 2 ? 'var(--neon-pink)' : '#7cff6b'} />
            {t.status === 'in_transit' && t.departDateKey === today && (
              <div className="dim gx-mini">
                {now < truckAttackAt(t) ? (
                  <>🎯 İhbar/sabotaj riski <Deadline untilMs={truckAttackAt(t)} /> · ⚔️ saldırı {fmtClock(truckAttackAt(t))}–24:00 · 🏚️ 00:00</>
                ) : (
                  <>⚔️ Saldırı penceresi · 🏚️ <Deadline untilMs={istMidnight(today) + 24 * 3600_000} label="sonra depoda" /></>
                )}
              </div>
            )}
            {seeCargo && t.status === 'in_transit' && o && (
              <div className="gx-cargo">
                🛣️{' '}
                {Object.entries(o.items || {})
                  .map(([k, q]) => `${q} × ${itemInfo(k).label}`)
                  .join(', ')}
              </div>
            )}
            {seeCargo && pend && (
              <div className="gx-cargo">
                📦{' '}
                {Object.entries(pend.items || {})
                  .map(([k, q]) => `${q} × ${itemInfo(k).label}`)
                  .join(', ')}
                {pend.departAtMs && <span className="dim"> · 🕒 {fmtClock(pend.departAtMs)}'de yola çıkacak</span>}
                {lead && pend.dateKey === today && (!pend.departAtMs || now < pend.departAtMs) && (
                  <button className="gx-link" onClick={() => run('cancelOrder', { orderId: pend.id }, { success: 'Sipariş iptal edildi' })}>
                    iptal
                  </button>
                )}
              </div>
            )}
          </Card>
        );
      })}

      <DepotItems depot={depot} lead={lead} listings={listings} />

      <RoadTrucks gangId={gangId} rank={d.rank} alliances={d.pacts || d.alliances} wars={d.wars} />

      {orderOpen && <OrderSheet trucks={trucks} routes={routes} state={d.state} depot={depot} gangId={gangId} orders={orders} onClose={() => setOrderOpen(false)} />}
      {ask && (
        <Confirm
          icon={ask === 'truck' ? '🚚' : '🏚️'}
          title={ask === 'truck' ? 'Tır alınsın mı?' : 'Depo alınsın mı?'}
          lines={ask === 'truck' ? [`💸 ${fmt(GANG_RULES.TRUCK_PRICE)} kasadan`, `⏳ ${GANG_RULES.TRUCK_LIFE_DAYS} gün`, '📅 Çete günde 1 tır alabilir'] : [`💸 ${fmt(GANG_RULES.DEPOT_PRICE)} kasadan`, `🏚️ +${GANG_RULES.DEPOT_STEP}`, '📅 Çete günde 1 kez genişletebilir']}
          confirmLabel="Satın al"
          busy={Boolean(busy)}
          onCancel={() => setAsk(null)}
          onConfirm={async () => {
            await run(ask === 'truck' ? 'buyTruck' : 'buyDepot', {}, { success: ask === 'truck' ? '🚚 Tır alındı' : '🏚️ Depo genişledi', withRequestId: true });
            setAsk(null);
          }}
        />
      )}
    </div>
  );
}
