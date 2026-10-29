// v127 — NEON ŞEHİR GAZETESİ (telefon › Gazete). Her gece 00:00'da belediye
// bir sayı basar (functions/belediye.js buildGazete). v2 (sade): manşet +
// birkaç önemli haber + başkanlık köşesi + halkın sesi. Eski sayılar eski düzende.
// Okuma: açılınca son 5 sayı (tek sorgu).
import { useEffect, useState } from 'react';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { db } from '../../firebase';
import { DEFAULT_RATES } from '../../../functions/belediyeRates.js';
import { gazeteNews } from '../../../functions/belediyeGazete.js';
import './Gazete.css';

const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const GUNLER = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const longDate = (k) => {
  const d = new Date(`${k}T12:00:00+03:00`);
  return `${Number(k.slice(8, 10))} ${AYLAR[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}, ${GUNLER[d.getUTCDay()]}`;
};
const shortDate = (k) => `${k.slice(8, 10)}.${k.slice(5, 7)}`;
const nf = (v) => Math.round(Number(v) || 0).toLocaleString('tr-TR');

// Eski düzende basılmış sayı (satır tablosu) → sade düzene çevrilir (istemcide;
// cümle seçimi güne göre sabit, her açılışta aynı manşet)
function seeded(key) {
  let h = 2166136261;
  for (const ch of String(key)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    return (h % 10000) / 10000;
  };
}
function toV2(g) {
  if (g.v === 2 || !Array.isArray(g.rows)) return g;
  const prev = { ...DEFAULT_RATES };
  const cur = { ...DEFAULT_RATES };
  for (const r of g.rows) {
    prev[r.id] = Number(r.prev);
    cur[r.id] = Number(r.cur);
  }
  return { ...g, v: 2, ...gazeteNews({ prev, cur, payrollUnpaid: Boolean(g.payrollUnpaid), rnd: seeded(g.dayKey) }) };
}

function Sayi({ g: raw }) {
  const g = toV2(raw);
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
        {g.headline?.s && <p>{g.headline.s}</p>}
        {g.headline?.d && <p className="gz-head-d">{g.headline.d}</p>}
      </section>

      {g.items?.length > 0 && (
        <section className="gz-news">
          {g.items.map((n, k) => (
            <div key={k} className="gz-news-item">
              <b className={n.good === true ? 'up' : n.good === false ? 'dn' : ''}>{n.t}</b>
              <span>{n.d}</span>
            </div>
          ))}
        </section>
      )}

      {g.politics?.items?.length > 0 && (
        <section className="gz-col">
          <h3 className="gz-h3">🗳️ Seçim</h3>
          <div className="gz-news">
            {g.politics.items.map((n, k) => (
              <div key={k} className="gz-news-item">
                <b>{n.t}</b>
                <span>{n.d}</span>
              </div>
            ))}
          </div>
        </section>
      )}

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

      {g.donor && (
        <section className="gz-col">
          <h3 className="gz-h3">🤲 Günün Bağışçısı</h3>
          <p className="gz-donor">
            <b>{g.donor.kind === 'gang' ? `${g.donor.name} çetesi` : g.donor.name}</b>
            <span>belediye kasasına {nf(g.donor.amount)} altın bağışladı</span>
          </p>
        </section>
      )}

      <footer className="gz-foot">Ayrıntılar Belediye Binası'nda · Her gece 00:00'da basılır</footer>
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
