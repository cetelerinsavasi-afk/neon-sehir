// v127 — NEON ŞEHİR GAZETESİ (telefon › Gazete). Her gece 00:00'da belediye
// bir sayı basar (functions/belediye.js buildGazete): manşet, hükümetin
// kararları (göreve gelince · dün · bugün), başkanlık köşesi, halkın sesi, kasa.
// Okuma: açılınca son 5 sayı (tek sorgu).
import { useEffect, useState } from 'react';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { db } from '../../firebase';
import { MINISTRIES, fmtRate } from '../../../functions/belediyeRates.js';
import './Gazete.css';

const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const GUNLER = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const longDate = (k) => {
  const d = new Date(`${k}T12:00:00+03:00`);
  return `${Number(k.slice(8, 10))} ${AYLAR[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}, ${GUNLER[d.getUTCDay()]}`;
};
const shortDate = (k) => `${k.slice(8, 10)}.${k.slice(5, 7)}`;
const nf = (v) => Math.round(Number(v) || 0).toLocaleString('tr-TR');

function Kararlar({ rows, govSince }) {
  if (!rows?.length) return <p className="gz-empty">Hükümet göreve geldiğinden beri hiçbir vergiye ve maaşa dokunmadı.</p>;
  return (
    <div className="gz-table">
      <div className="gz-tr gz-th">
        <span>Kalem</span>
        <span title={govSince ? `Göreve geliş: ${shortDate(govSince)}` : ''}>Göreve gelince</span>
        <span>Dün</span>
        <span>Bugün</span>
      </div>
      {rows.map((r) => (
        <div key={r.id} className={`gz-tr${r.today ? ' today' : ''}`}>
          <span className="gz-item">
            <b>{r.label}</b>
            <small>{MINISTRIES[r.m]?.short}</small>
            {r.note && <i>“{r.note}”</i>}
          </span>
          <span>{fmtRate(r.start, r.unit)}</span>
          <span>{fmtRate(r.prev, r.unit)}</span>
          <span className={r.today ? (r.good ? 'up' : 'dn') : ''}>
            {r.today ? (r.cur > r.prev ? '▲ ' : '▼ ') : ''}
            {fmtRate(r.cur, r.unit)}
          </span>
        </div>
      ))}
    </div>
  );
}

function Sayi({ g }) {
  return (
    <article className="gz-paper">
      <header className="gz-mast">
        <div className="gz-mast-row">
          <span>Sayı · {shortDate(g.dayKey)}</span>
          <span>Fiyatı: 0 altın</span>
        </div>
        <h1>NEON ŞEHİR GAZETESİ</h1>
        <div className="gz-mast-row">
          <span>{longDate(g.dayKey)}</span>
          <span>{g.mayor ? `Başkan: ${g.mayor.name}` : 'Başkanlık boş'}</span>
        </div>
      </header>

      <section className={`gz-head ${g.headline?.kind || ''}`}>
        <h2>{g.headline?.t}</h2>
        <p>{g.headline?.s}</p>
      </section>

      <section>
        <h3 className="gz-h3">🏛️ Hükümetin Kararları</h3>
        <Kararlar rows={g.rows} govSince={g.govSince} />
      </section>

      {g.article && (
        <section className="gz-col">
          <h3 className="gz-h3">✒️ Başkanlık Köşesi</h3>
          <p className="gz-byline">
            {g.article.byTitle} · <b>{g.article.byName}</b>:
          </p>
          <p className="gz-article">{g.article.text}</p>
        </section>
      )}

      {g.complaint && (
        <section className="gz-col">
          <h3 className="gz-h3">📣 Halkın Sesi</h3>
          <blockquote className="gz-quote">
            “{g.complaint.text}”
            <footer>
              — {g.complaint.name} · ❤️ {nf(g.complaint.likes)}
            </footer>
          </blockquote>
        </section>
      )}

      {g.kasa && (
        <section className="gz-col gz-kasa">
          <h3 className="gz-h3">💰 Kasa</h3>
          <p>{g.kasa.line}</p>
          <p className="gz-kasa-nums">
            Gelir {nf(g.kasa.in)} · Gider {nf(g.kasa.out)} · Net {g.kasa.net >= 0 ? '+' : '−'}
            {nf(Math.abs(g.kasa.net))}
          </p>
          {g.payrollUnpaid && <p className="gz-alarm">⚠️ Bu gece maaşlar ödenemedi.</p>}
        </section>
      )}
      <footer className="gz-foot">Neon Şehir Belediyesi yayın organıdır · Her gece 00:00'da basılır</footer>
    </article>
  );
}

export default function GazeteScreen() {
  const [list, setList] = useState(null);
  const [i, setI] = useState(0);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let alive = true;
    getDocs(query(collection(db, 'belediyeGazete'), orderBy('dayKey', 'desc'), limit(5)))
      .then((s) => alive && setList(s.docs.map((d) => d.data())))
      .catch(() => alive && setErr(true));
    return () => {
      alive = false;
    };
  }, []);
  if (err) return <div className="gz-wrap"><p className="gz-empty">Gazete şu an dağıtılamadı.</p></div>;
  if (!list) return <div className="gz-wrap"><p className="gz-empty">Gazete geliyor…</p></div>;
  if (!list.length) return <div className="gz-wrap"><p className="gz-empty">İlk sayı bu gece 00:00'da basılacak.</p></div>;
  const g = list[Math.min(i, list.length - 1)];
  return (
    <div className="gz-wrap">
      {list.length > 1 && (
        <div className="gz-issues">
          {list.map((x, n) => (
            <button key={x.dayKey} className={n === i ? 'on' : ''} onClick={() => setI(n)}>
              {n === 0 ? 'Bugün' : shortDate(x.dayKey)}
            </button>
          ))}
        </div>
      )}
      <Sayi g={g} />
    </div>
  );
}
