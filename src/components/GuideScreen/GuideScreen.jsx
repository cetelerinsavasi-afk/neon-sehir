// Neon Şehir — Sokak Rehberi (telefondaki "Neon Şehir" uygulaması).
// Tasarım ve metin oyun tasarımcısının hazırladığı rehberden birebir
// alındı; sadece telefon ekranına sığacak şekilde React'e taşındı.
// Kaydırma (sağa/sola), ok tuşları, İçindekiler ve konum hatırlama korunur.
import { useCallback, useEffect, useRef, useState } from 'react';
import { CATS } from './guideContent';
import './GuideScreen.css';

const POS_KEY = 'rehber:pos';
const catIndex = (id) => CATS.findIndex((c) => c.id === id);

function loadPos() {
  try {
    const s = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
    if (s && s.v === 'page' && CATS[s.c] && CATS[s.c].pages[s.p]) return { view: 'page', cat: s.c, page: s.p };
  } catch {
    /* yoksa İçindekiler */
  }
  return { view: 'toc', cat: 0, page: 0 };
}

function ensureFont() {
  if (document.getElementById('guide-oswald')) return;
  const l = document.createElement('link');
  l.id = 'guide-oswald';
  l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&display=swap';
  document.head.appendChild(l);
}

function Detail({ it }) {
  return (
    <div className="detail">
      <h3>
        {it.i} {it.name}
      </h3>
      {it.sub && <p className="sub">{it.sub}</p>}
      <ul>
        {it.lines.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

export default function GuideScreen() {
  const [st, setSt] = useState(loadPos);
  const [dir, setDir] = useState(null);
  const [anim, setAnim] = useState(0);
  const [pick, setPick] = useState({});
  const tabsRef = useRef(null);
  const sx = useRef(null);

  useEffect(ensureFont, []);
  useEffect(() => {
    try {
      localStorage.setItem(POS_KEY, JSON.stringify({ v: st.view, c: st.cat, p: st.page }));
    } catch {
      /* konum hatırlanmaz, sorun değil */
    }
    const active = tabsRef.current?.querySelector('[aria-selected="true"]');
    if (active) active.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [st]);

  const go = useCallback((cat, page, d) => {
    setSt({ view: 'page', cat, page });
    setDir(d);
    setAnim((n) => n + 1);
  }, []);
  const toc = useCallback((d = 'prev') => {
    setSt((s) => ({ ...s, view: 'toc' }));
    setDir(d);
    setAnim((n) => n + 1);
  }, []);
  const next = useCallback(() => {
    const cat = CATS[st.cat];
    if (st.view === 'toc') return;
    if (st.page < cat.pages.length - 1) go(st.cat, st.page + 1, 'next');
    else if (st.cat < CATS.length - 1) go(st.cat + 1, 0, 'next');
    else toc('next');
  }, [st, go, toc]);
  const prev = useCallback(() => {
    if (st.view === 'toc') return;
    if (st.page > 0) go(st.cat, st.page - 1, 'prev');
    else toc('prev');
  }, [st, go, toc]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'Escape') toc();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [next, prev, toc]);

  const cat = CATS[st.cat];
  const p = cat.pages[st.page];
  const animClass = dir === 'prev' ? 'flip-prev' : dir === 'next' ? 'flip-next' : 'fade-in';

  let page;
  if (st.view === 'toc') {
    page = (
      <article key={`toc_${anim}`} className={`page ${animClass}`} style={{ '--c': '#19e8ff' }}>
        <div className="scroll">
          <h2>İçindekiler</h2>
          <p className="kicker">Şehir seni bekliyor. Nereden başlayacaksın?</p>
          <div className="toc">
            {CATS.map((c, i) => (
              <button key={c.id} className="toc-item" style={{ '--c': c.color }} onClick={() => go(i, 0, 'next')}>
                <span className="e">{c.icon}</span>
                <div>
                  <b>{c.name}</b>
                  <span>{c.tag}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </article>
    );
  } else {
    const key = `${st.cat}:${st.page}`;
    const sel = pick[key] ?? 0;
    page = (
      <article key={`p_${anim}`} className={`page ${animClass}`} style={{ '--c': cat.color }}>
        <div className="scroll">
          <h2>{p.title}</h2>
          <p className="kicker">{p.kicker}</p>
          {p.type === 'lines' && (
            <>
              <ul className="lines">
                {p.lines.map((l, i) => (
                  <li key={i}>
                    <span className="ico">{l.i}</span>
                    <p>{l.t}</p>
                  </li>
                ))}
              </ul>
              {p.tags && (
                <div className="tags">
                  {p.tags.map((t) => (
                    <span key={t} className="tag">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
          {p.type === 'grid' && (
            <div className="grid">
              {p.cards.map((c, i) => {
                const ext = c.go.cat ? CATS[catIndex(c.go.cat)] : null;
                return (
                  <button key={i} className="gcard" style={{ '--gc': ext ? ext.color : cat.color }} onClick={() => go(c.go.cat ? catIndex(c.go.cat) : st.cat, c.go.page, 'next')}>
                    <span className="e">{c.i}</span>
                    <b>{c.name}</b>
                    <span className="d">{c.t}</span>
                    {ext && <span className="out">{ext.name} bölümünde ↗</span>}
                  </button>
                );
              })}
            </div>
          )}
          {p.type === 'pick' && (
            <>
              <div className="chips" role="group" aria-label="Seçenekler">
                {p.items.map((x, i) => (
                  <button key={x.name} className="chip" aria-pressed={i === sel} onClick={() => setPick({ ...pick, [key]: i })}>
                    {x.i} {x.name}
                  </button>
                ))}
              </div>
              <Detail key={sel} it={p.items[sel]} />
            </>
          )}
        </div>
      </article>
    );
  }

  const n = cat.pages.length;
  const first = st.page === 0;
  const last = st.page === n - 1;
  const nextCat = CATS[st.cat + 1];

  return (
    <div className="guide">
      <header className="top">
        <div className="brand">
          <small>Neon Şehir</small>
          <b>Sokak Rehberi</b>
        </div>
        <button className="home-btn" onClick={() => toc()} aria-label="İçindekiler">
          📖 İçindekiler
        </button>
      </header>
      <nav className="tabs" ref={tabsRef} role="tablist" aria-label="Kategoriler">
        {CATS.map((c, i) => (
          <button key={c.id} className="tab" role="tab" style={{ '--c': c.color }} aria-selected={st.view === 'page' && st.cat === i} onClick={() => go(i, 0, i >= st.cat ? 'next' : 'prev')}>
            {c.icon} {c.name}
          </button>
        ))}
      </nav>
      <main
        className="stage"
        onTouchStart={(e) => {
          sx.current = e.touches[0].clientX;
        }}
        onTouchEnd={(e) => {
          if (sx.current === null || st.view === 'toc') return;
          const dx = e.changedTouches[0].clientX - sx.current;
          sx.current = null;
          if (Math.abs(dx) > 70) (dx < 0 ? next : prev)();
        }}
      >
        {page}
      </main>
      {st.view === 'page' && (
        <footer className="foot" style={{ '--c': cat.color }}>
          <div className="dots">
            {cat.pages.map((_, i) => (
              <button key={i} className="dot" aria-label={`Sayfa ${i + 1}`} aria-current={i === st.page ? 'true' : undefined} onClick={() => go(st.cat, i, i > st.page ? 'next' : 'prev')} />
            ))}
            <span className="count">
              {st.page + 1} / {n}
            </span>
          </div>
          <div className="nav">
            <button onClick={prev}>{first ? '📖 İçindekiler' : '‹ Geri'}</button>
            <button className="next" onClick={next}>
              {last ? (nextCat ? `${nextCat.icon} ${nextCat.name} ›` : '📖 İçindekiler') : 'İleri ›'}
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}
