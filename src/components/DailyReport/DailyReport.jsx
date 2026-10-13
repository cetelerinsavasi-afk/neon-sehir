import { useEffect, useMemo, useState } from 'react';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayer } from '../../hooks/usePlayer';
import { midnightDayKey } from '../../../functions/businessCatalogData.js';
import { moneySource } from '../../lib/moneySources';
import './DailyReport.css';

// =============================================================================
// v92 — Profil › 📊 Günlük Rapor
// Bugün (canlı) + önceki 2 gün: cebine giren / çıkan altın, net, kaynaklar.
// Veri: moneyLog/{uid}_{gün} (sunucu tetikleyicisi yazar; functions/moneyLog.js)
// =============================================================================

const DAY = 24 * 60 * 60 * 1000;
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('tr-TR');
const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
function dayLabel(key) {
  const [, m, d] = key.split('-').map(Number);
  return `${d} ${AYLAR[m - 1] || ''}`;
}

export default function DailyReport({ onBack }) {
  const { user } = useAuth();
  const { player } = usePlayer();
  const keys = useMemo(() => {
    const t = Date.now();
    return [0, 1, 2].map((k) => midnightDayKey(t - k * DAY));
  }, []);
  const [tab, setTab] = useState(0);
  const [today, setToday] = useState(null);
  const [past, setPast] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return undefined;
    return onSnapshot(
      doc(db, 'moneyLog', `${user.uid}_${keys[0]}`),
      (s) => {
        setToday(s.exists() ? s.data() : null);
        setLoading(false);
      },
      () => setLoading(false)
    );
  }, [user, keys]);
  useEffect(() => {
    if (!user) return;
    keys.slice(1).forEach((k) => {
      getDoc(doc(db, 'moneyLog', `${user.uid}_${k}`))
        .then((s) => setPast((p) => ({ ...p, [k]: s.exists() ? s.data() : null })))
        .catch(() => setPast((p) => ({ ...p, [k]: null })));
    });
  }, [user, keys]);

  const d = tab === 0 ? today : past[keys[tab]];
  const inSum = Number(d?.in || 0);
  const outSum = Number(d?.out || 0);
  const net = inSum - outSum;
  const rows = Object.entries(d?.by || {})
    .map(([k, v]) => ({ k, in: Number(v?.in || 0), out: Number(v?.out || 0), n: Number(v?.n || 0) }))
    .filter((r) => r.in || r.out)
    .sort((a, b) => b.in + b.out - (a.in + a.out));
  const maxRow = rows.reduce((m, r) => Math.max(m, r.in, r.out), 1);
  const inPct = inSum + outSum > 0 ? (inSum / (inSum + outSum)) * 100 : 50;

  return (
    <div className="dr-root">
      <div className="dr-head">
        <button className="dr-back" onClick={onBack} aria-label="Geri">
          ←
        </button>
        <div className="dr-title">
          <b>📊 Günlük Rapor</b>
          <small>Cebine giren ve çıkan altın · gün 00:00’da yenilenir</small>
        </div>
      </div>

      <div className="dr-tabs" role="tablist">
        {keys.map((k, i) => (
          <button key={k} role="tab" aria-selected={tab === i} className={tab === i ? 'on' : ''} onClick={() => setTab(i)}>
            <b>{i === 0 ? 'Bugün' : i === 1 ? 'Dün' : 'Önceki gün'}</b>
            <span>
              {dayLabel(k)}
              {i === 0 && <i className="dr-live">canlı</i>}
            </span>
          </button>
        ))}
      </div>

      <div className="dr-body">
        <div className="dr-summary">
          <div className="dr-net">
            <span>Net</span>
            <b className={net > 0 ? 'pos' : net < 0 ? 'neg' : ''}>
              {net > 0 ? '+' : net < 0 ? '−' : ''}
              {fmt(Math.abs(net))}
              <span className="gold-coin-icon" style={{ width: 18, height: 18 }} />
            </b>
          </div>
          <div className="dr-split">
            <div className="dr-in">
              <span>Giren</span>
              <b>{inSum ? `+${fmt(inSum)}` : '0'}</b>
            </div>
            <div className="dr-out">
              <span>Çıkan</span>
              <b>{outSum ? `−${fmt(outSum)}` : '0'}</b>
            </div>
          </div>
          <div className="dr-ratio" aria-hidden="true">
            <i className="in" style={{ width: `${inPct}%` }} />
            <i className="out" style={{ width: `${100 - inPct}%` }} />
          </div>
          {tab === 0 && (
            <p className="dr-balance">
              Şu an cebinde: <b>{fmt(player?.gold)}</b> altın
            </p>
          )}
        </div>

        <p className="dr-sec-title">Nereden geldi, nereye gitti?</p>
        {loading && tab === 0 ? (
          <p className="dr-empty">Yükleniyor…</p>
        ) : rows.length === 0 ? (
          <p className="dr-empty">{tab === 0 ? 'Bugün henüz altın hareketin yok.' : 'Bu gün için kayıt yok.'}</p>
        ) : (
          <div className="dr-rows">
            {rows.map((r) => {
              const s = moneySource(r.k);
              const rn = r.in - r.out;
              return (
                <div key={r.k} className="dr-row">
                  <span className="dr-ico">{s.icon}</span>
                  <div className="dr-row-main">
                    <div className="dr-row-top">
                      <b>{s.label}</b>
                      <em className={rn > 0 ? 'pos' : rn < 0 ? 'neg' : ''}>
                        {rn > 0 ? '+' : rn < 0 ? '−' : ''}
                        {fmt(Math.abs(rn))}
                      </em>
                    </div>
                    <div className="dr-bars">
                      {r.in > 0 && (
                        <span className="dr-bar in">
                          <i style={{ width: `${Math.max(4, (r.in / maxRow) * 100)}%` }} />
                          <small>+{fmt(r.in)}</small>
                        </span>
                      )}
                      {r.out > 0 && (
                        <span className="dr-bar out">
                          <i style={{ width: `${Math.max(4, (r.out / maxRow) * 100)}%` }} />
                          <small>−{fmt(r.out)}</small>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="dr-note">Bugün, dün ve önceki gün tutulur. “Diğer”: kaynağı ayrıca kaydedilmeyen küçük hareketler (iade, ceza, ödül…).</p>
      </div>
    </div>
  );
}
