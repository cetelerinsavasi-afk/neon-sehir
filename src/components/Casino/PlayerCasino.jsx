/* eslint-disable react-refresh/only-export-components */
import { useEffect, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { useInventory } from '../../hooks/useInventory';
import { shopAction, leaveOnNumaraTable } from '../../services/gameActions';
import SlotScreen from '../SlotScreen/SlotScreen';
import RouletteGame from '../Roulette/RouletteGame';
import LotteryScreen from '../LotteryScreen/LotteryScreen';
import OnNumaraScreen from '../OnNumaraScreen/OnNumaraScreen';
import OnNumaraTable from '../OnNumaraScreen/OnNumaraTable';
import QuantityStepper from '../QuantityStepper/QuantityStepper';
import PriceField from '../Shop/PriceField';
import ConfirmButton from '../ConfirmButton/ConfirmButton';
import { useBelediyeRates } from '../../hooks/useBelediyeRates';
import { bizRateFrac } from '../../../functions/belediyeRates.js';
import { CASINO_MACHINES, CASINO_MACHINE_LABEL, CASINO_TEXT, CASINO_TABLE_MAX_BET, casinoPricesOf, casinoWithdrawSplit, slotReady } from '../../../functions/casino.js';
import { SLOT_PRICE_MIN, SLOT_PRICE_MAX, SLOT_PRICE_STEP, SLOT_MIN_STOCK, SLOT_GAME_COST, GAME_LOTTERY_CUT, LOTTERY_CUT_MIN, LOTTERY_CUT_MAX, lotteryTicketPrice } from '../../../functions/casinoRules.js';
import '../../styles/bizui.css';
import './PlayerCasino.css';

// =============================================================================
// v124 Faz 6 — OYUNCU GAZİNOSU ekranları (sunucu: functions/casino.js)
//   CasinoGamesSheet   : müşteri — gazinonun oyunları (Slot · Rulet · 10 Numara · Piyango)
//                        (Faz 7 yayın paneli de bunu piyangosuz kullanır)
//   CasinoPriceSection : sahip — slot ücreti 1.400–1.600 (±50), bilet kârı 1–10
//   CasinoInvSection   : sahip — makinelere altın / yasaklı madde ekle · çek (%10 vergi)
//   CasinoReportCard   : sahip — makine başı günlük rapor (kazanç / verilen)
// =============================================================================
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');
const EMPTY = { gold: 0, yasakliMadde: 0 };

function Gold({ v }) {
  return (
    <span className="bz-gold">
      <span className="gold-coin-icon" style={{ width: 13, height: 13 }} />
      {fmt(v)}
    </span>
  );
}

export function casinoErrText(err) {
  const m = String(err?.message || err || '');
  if (m === 'gold') return 'Altının yetmiyor.';
  if (m === 'own-short') return 'Envanterinde o kadar yasaklı madde yok.';
  if (m === 'casino-short') return 'Makinede o kadar yok.';
  if (m.startsWith('tax-changed')) return 'Tutar az önce değişti, tekrar dene.';
  if (m.startsWith('price-changed')) return `Fiyat az önce değişti (yeni fiyat: ${fmt(m.split(':')[1])}). Kontrol edip tekrar dene.`;
  if (m.startsWith('price-band')) return 'Fiyat izin verilen aralıkta değil.';
  if (m === 'biz-casino-table') return 'Gazinoda açık 10 Numara masası varken gazino kapatılamaz. Masalar kapanınca tekrar dene.';
  return m || 'İşlem yapılamadı.';
}

// Makine kasaları (herkese açık belgeler: casinoMachines/{ev}_{slot|rulet|kart})
export function useCasinoMachines(casinoId, enabled = true) {
  const [m, setM] = useState({ slot: null, rulet: null, kart: null });
  useEffect(() => {
    if (!casinoId || !enabled) return undefined;
    const offs = CASINO_MACHINES.map((k) =>
      onSnapshot(
        doc(db, 'casinoMachines', `${casinoId}_${k}`),
        (s) => setM((x) => ({ ...x, [k]: s.exists() ? { ...EMPTY, ...s.data() } : { ...EMPTY } })),
        () => setM((x) => ({ ...x, [k]: { ...EMPTY } }))
      )
    );
    return () => offs.forEach((f) => f());
  }, [casinoId, enabled]);
  return m;
}

export const CASINO_GAMES = [
  { id: 'slot', icon: '🎰', label: 'Slot' },
  { id: 'rulet', icon: '🎡', label: 'Rulet' },
  { id: 'onnumara', icon: '🃏', label: '10 Numara' },
  { id: 'piyango', icon: '🎟️', label: 'Piyango' },
];

// ---- müşteri: gazinonun oyunları ------------------------------------------------------
// casinoId: gazino evi · houseDoc: ev belgesi (ad, fiyatlar, sahibi) · initialGame: doğrudan açılacak oyun
// games: gösterilecek oyunlar (Faz 7 yayında piyango yok) · onResult(game, sonuç) · onTable(tableId|null)
// v124 Faz 7 (yayın): casinoId 'game' = Neon Gazino (sınırsız kasa) · onEnterTable: 10 Numara masası
// dışarıda (tam ekran) açılsın · onState(game, durum): rulet/slot durumu yayına · onGame(game|null)
export function CasinoGamesSheet({ casinoId, houseDoc, initialGame = null, games = ['slot', 'rulet', 'onnumara', 'piyango'], onClose, onResult, onTable, onEnterTable, onState, onGame }) {
  const { user } = useAuth();
  const [game, setGame] = useState(initialGame);
  const [tableId, setTableId] = useState(null);
  const tableRef = useRef(null);
  const isGame = casinoId === 'game';
  const mc0 = useCasinoMachines(casinoId, !isGame);
  const UNL = { gold: Infinity, yasakliMadde: Infinity };
  const mc = isGame ? { slot: UNL, rulet: UNL, kart: UNL } : mc0;
  const prices = isGame ? { slot: SLOT_GAME_COST, cut: GAME_LOTTERY_CUT } : casinoPricesOf(houseDoc);
  const closed = !isGame && houseDoc && houseDoc.biz?.type !== 'gazino';
  useEffect(() => {
    onGame?.(game);
  }, [game, onGame]);

  // 10 Numara masasından: oyun değişince / panel kapanınca kalkılır
  useEffect(() => {
    tableRef.current = tableId;
    onTable?.(tableId);
  }, [tableId, onTable]);
  useEffect(() => {
    if (game !== 'onnumara' && tableRef.current) {
      const tid = tableRef.current;
      tableRef.current = null;
      setTableId(null);
      leaveOnNumaraTable(tid).catch(() => {});
    }
  }, [game]);
  useEffect(
    () => () => {
      if (tableRef.current) leaveOnNumaraTable(tableRef.current).catch(() => {});
    },
    []
  );

  const status = (id) => {
    if (id === 'slot') return mc.slot ? `${fmt(prices.slot)} altın · ${slotReady(mc.slot) ? 'çalışıyor' : 'çalışmıyor'}` : '…';
    if (isGame && (id === 'rulet' || id === 'onnumara')) return '';
    if (id === 'rulet') return mc.rulet ? `Masada ${fmt(mc.rulet.gold)} altın` : '…';
    if (id === 'onnumara') return mc.kart ? `Max bahis ${fmt(Math.min(CASINO_TABLE_MAX_BET, mc.kart.gold))} altın` : '…';
    return `Bilet ${fmt(lotteryTicketPrice(prices.cut))} altın`;
  };
  const off = (id) => (id === 'slot' && mc.slot && !slotReady(mc.slot)) || ((id === 'rulet' || id === 'onnumara') && mc[id === 'rulet' ? 'rulet' : 'kart'] && !(mc[id === 'rulet' ? 'rulet' : 'kart'].gold > 0));
  const isOwner = Boolean(!isGame && user && houseDoc?.ownerUid === user.uid);
  const blocked = closed ? CASINO_TEXT.closed : isOwner ? CASINO_TEXT.own : null;
  const g = CASINO_GAMES.find((x) => x.id === game);

  return (
    <div className="bz cs-root" onClick={(e) => e.stopPropagation()}>
      <div className="bz-head">
        <div className="bz-head-main">
          <h3>
            {g ? `${g.icon} ${g.label}` : '🎰 Oyunlar'}
          </h3>
          <p>{isGame ? 'Neon Gazino' : houseDoc?.name || 'Gazino'}</p>
        </div>
        {onClose && (
          <button className="bz-x" onClick={onClose} aria-label="Kapat">
            ✕
          </button>
        )}
      </div>
      {!game ? (
        <div className="cs-games">
          {CASINO_GAMES.filter((x) => games.includes(x.id)).map((x) => (
            <button key={x.id} className={`cs-game${off(x.id) ? ' off' : ''}`} onClick={() => setGame(x.id)}>
              <span className="cs-game-ico">{x.icon}</span>
              <span className="cs-game-txt">
                <b>{x.label}</b>
                <small>{status(x.id)}</small>
              </span>
              <span className="cs-game-go">›</span>
            </button>
          ))}
          {blocked && <p className="bz-warn">{blocked}</p>}
        </div>
      ) : (
        <>
          {!initialGame && (
            <button className="cs-back" onClick={() => setGame(null)}>
              ‹ Oyunlar
            </button>
          )}
          {blocked && game !== 'piyango' && game !== 'slot' ? (
            <p className="bz-warn">{blocked}</p>
          ) : game === 'slot' ? (
            <SlotScreen
              key={`slot-${casinoId}`}
              casinoId={casinoId}
              price={prices.slot}
              blocked={blocked || (!isGame && mc.slot && !slotReady(mc.slot) ? CASINO_TEXT.slotEmpty : null)}
              onResult={(r) => onResult?.('slot', r)}
              onState={onState ? (st) => onState('slot', st) : undefined}
            />
          ) : game === 'rulet' ? (
            <RouletteGame
              key={`rul-${casinoId}`}
              casinoId={casinoId}
              bankLimit={isGame ? null : Number(mc.rulet?.gold || 0)}
              onResult={(r) => onResult?.('rulet', r)}
              onState={onState ? (st) => onState('rulet', st) : undefined}
            />
          ) : game === 'onnumara' ? (
            tableId ? (
              <OnNumaraTable tableId={tableId} myUid={user?.uid} onLeave={() => setTableId(null)} />
            ) : (
              <OnNumaraScreen casinoId={casinoId} maxBet={isGame ? null : Math.min(CASINO_TABLE_MAX_BET, Number(mc.kart?.gold || 0))} blocked={blocked} onEnterTable={(id) => (onEnterTable ? onEnterTable(id) : setTableId(id))} />
            )
          ) : (
            <LotteryScreen casinoId={casinoId} cut={prices.cut} price={lotteryTicketPrice(prices.cut)} blocked={blocked} />
          )}
        </>
      )}
    </div>
  );
}

// ---- sahip: fiyatlar -----------------------------------------------------------------
export function CasinoPriceSection({ houseId, houseDoc }) {
  const saved = casinoPricesOf(houseDoc);
  const [slot, setSlot] = useState(saved.slot);
  const [cut, setCut] = useState(saved.cut);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    setSlot(saved.slot);
    setCut(saved.cut);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [houseDoc?.bizPricesAtMs]);
  const dirty = slot !== saved.slot || cut !== saved.cut;
  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await shopAction({ op: 'casinoPrice', houseId, slot, cut });
      setMsg({ ok: true, text: '✓ Fiyatlar kaydedildi.' });
    } catch (err) {
      setMsg({ ok: false, text: casinoErrText(err) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="bz-sec">
      <p className="bz-sec-title">🎰 Slot makinesi</p>
      <PriceField label="Çevirme ücreti" value={slot} min={SLOT_PRICE_MIN} max={SLOT_PRICE_MAX} step={SLOT_PRICE_STEP} onChange={setSlot} saved={saved.slot} />
      <p className="bz-sec-title">🎟️ Piyango gişesi</p>
      <PriceField
        label={`Bilet fiyatı · kârın ${fmt(cut)}`}
        value={lotteryTicketPrice(cut)}
        min={lotteryTicketPrice(LOTTERY_CUT_MIN)}
        max={lotteryTicketPrice(LOTTERY_CUT_MAX)}
        step={1}
        onChange={(v) => setCut(v - lotteryTicketPrice(0))}
        saved={lotteryTicketPrice(saved.cut)}
      />
      {msg && <p className={msg.ok ? 'bz-ok' : 'bz-warn'}>{msg.text}</p>}
      <button className="bz-btn gold wide" disabled={!dirty || busy} onClick={save}>
        {busy ? 'Kaydediliyor…' : 'Fiyatları kaydet'}
      </button>
    </div>
  );
}

// ---- sahip: makine envanterleri --------------------------------------------------------
const MACHINE_ICON = { slot: '🎰', rulet: '🎡', kart: '🃏' };
export function CasinoInvSection({ houseId }) {
  const { player } = usePlayer();
  const { inventory } = useInventory();
  const mcs = useCasinoMachines(houseId);
  const rates = useBelediyeRates(); // v127: Kumarhane vergisi (Ticaret Bakanlığı) — sunucu expectTax ile denetler
  const [m, setM] = useState('slot');
  const [asset, setAsset] = useState('gold');
  const [qty, setQty] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    if (m !== 'slot') setAsset('gold');
  }, [m]);
  useEffect(() => {
    setQty(0);
    setMsg(null);
  }, [m, asset]);
  const mc = mcs[m];
  const inMachine = Math.max(0, Number(mc?.[asset] || 0));
  const mine = asset === 'gold' ? Math.max(0, Number(player?.gold || 0)) : Math.max(0, Number(inventory?.yasakliMadde || 0));
  const unitTxt = asset === 'gold' ? 'altın' : 'adet';
  const sp = casinoWithdrawSplit(qty, bizRateFrac(rates, 'gazino'));
  const run = async (sign) => {
    if (!qty) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await shopAction({ op: 'casinoStock', houseId, machine: m, asset, qty: sign * qty, ...(sign < 0 && asset === 'gold' ? { expectTax: sp.tax } : {}) });
      setMsg({
        ok: true,
        text:
          sign > 0
            ? `✓ ${CASINO_MACHINE_LABEL[m]}: ${fmt(qty)} ${unitTxt} eklendi.`
            : asset === 'gold'
              ? `✓ ${fmt(r.withdrawn)} altın çekildi · vergi ${fmt(r.tax)} · cebine ${fmt(r.net)} altın.`
              : `✓ ${fmt(qty)} yasaklı madde envanterine alındı.`,
      });
      setQty(0);
    } catch (err) {
      setMsg({ ok: false, text: casinoErrText(err) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="bz-sec">
      <p className="bz-sec-title">📦 Makine envanterleri</p>
      {CASINO_MACHINES.map((k) => (
        <div className="bz-row" key={k}>
          <span>
            {MACHINE_ICON[k]} {CASINO_MACHINE_LABEL[k]}
          </span>
          <b>
            {mcs[k] ? (
              <>
                <Gold v={mcs[k].gold} />
                {k === 'slot' ? ` · 💊 ${fmt(mcs[k].yasakliMadde)}` : ''}
              </>
            ) : (
              '…'
            )}
          </b>
        </div>
      ))}
      {mcs.slot && !slotReady(mcs.slot) && (
        <p className="bz-warn">
          🎰 En az 💊 {fmt(SLOT_MIN_STOCK.yasakliMadde)} + 🪙 {fmt(SLOT_MIN_STOCK.gold)}
        </p>
      )}
      <div className="bz-tabs cs-mtabs">
        {CASINO_MACHINES.map((k) => (
          <button key={k} className={m === k ? 'on' : ''} onClick={() => setM(k)}>
            {MACHINE_ICON[k]} {k === 'kart' ? '10 Numara' : k === 'slot' ? 'Slot' : 'Rulet'}
          </button>
        ))}
      </div>
      {m === 'slot' && (
        <div className="bz-tabs">
          <button className={asset === 'gold' ? 'on' : ''} onClick={() => setAsset('gold')}>
            🪙 Altın
          </button>
          <button className={asset === 'yasakliMadde' ? 'on' : ''} onClick={() => setAsset('yasakliMadde')}>
            💊 Yasaklı madde
          </button>
        </div>
      )}
      <div className="bz-row">
        <span>{asset === 'gold' ? 'Cebindeki altın' : 'Envanterindeki yasaklı madde'}</span>
        <b>
          {fmt(mine)} {unitTxt}
        </b>
      </div>
      <div className="bz-row">
        <span>Makinede</span>
        <b>
          {fmt(inMachine)} {unitTxt}
        </b>
      </div>
      <QuantityStepper value={qty} onChange={setQty} min={0} max={Math.max(mine, inMachine)} step={asset === 'gold' ? 100 : 1} />
      {msg && <p className={msg.ok ? 'bz-ok' : 'bz-warn'}>{msg.text}</p>}
      <div className="bz-btns">
        <ConfirmButton
          className="bz-btn ghost"
          disabled={busy || !qty || qty > inMachine}
          title={asset === 'gold' ? `${fmt(qty)} altın çekilsin mi?` : `${fmt(qty)} yasaklı madde çekilsin mi?`}
          lines={asset === 'gold' ? [`🏛️ Vergi (%${rates.isKumar}): ${fmt(sp.tax)} altın`, `Cebine geçecek: ${fmt(sp.net)} altın`] : []}
          confirmLabel="Çek"
          onConfirm={() => run(-1)}
        >
          ⬇️ Çek
        </ConfirmButton>
        <ConfirmButton className="bz-btn gold" disabled={busy || !qty || qty > mine} title={`${CASINO_MACHINE_LABEL[m]}: ${fmt(qty)} ${unitTxt} eklensin mi?`} confirmLabel="Ekle" onConfirm={() => run(1)}>
          ⬆️ Ekle
        </ConfirmButton>
      </div>
    </div>
  );
}

// ---- sahip: günlük rapor (makine başı; kâr / zarar yok) ---------------------------------
const REPORT_ROWS = [
  { id: 'slot', icon: '🎰', label: 'Slot' },
  { id: 'piyango', icon: '🎟️', label: 'Piyango gişesi' },
  { id: 'rulet', icon: '🎡', label: 'Rulet' },
  { id: 'onnumara', icon: '🃏', label: '10 Numara' },
];
export function CasinoReportCard({ label, d }) {
  const c = d?.casino || {};
  const customers = d ? (Number.isFinite(d.customers) ? d.customers : Object.keys(d.cust || {}).length) : 0;
  return (
    <div className="bz-sec">
      <p className="bz-sec-title">{label}</p>
      <div className="cs-rep">
        <div className="cs-rep-row head">
          <span>Makine</span>
          <span>Kazanç</span>
          <span>Verilen</span>
        </div>
        {REPORT_ROWS.map((r) => {
          const v = c[r.id] || {};
          const given = r.id === 'slot' ? `${fmt(v.outGold)} altın${Number(v.outYm) > 0 ? ` + ${fmt(v.outYm)} yasaklı madde` : ''}` : `${fmt(v.out)} altın`;
          return (
            <div className="cs-rep-row" key={r.id}>
              <span>
                {r.icon} {r.label}
              </span>
              <span>{fmt(v.in)} altın</span>
              <span>{given}</span>
            </div>
          );
        })}
      </div>
      <div className="bz-row">
        <span>Müşteri sayısı</span>
        <b>{fmt(customers)}</b>
      </div>
      {!d && <p className="bz-hint">Henüz kayıt yok.</p>}
    </div>
  );
}
