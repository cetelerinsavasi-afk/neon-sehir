import { useState } from 'react';
import { STORE_APPS, STORE_BY_ID } from './cappstoreApps';
import './Cappstore.css';

// =============================================================================
// v161 — CAPPSTORE: Neon Şehir'in uygulama mağazası (telefonun içinde)
//   Bugün: öne çıkanlar · Uygulamalar: 5 uygulamanın listesi · detay sayfası
//   İndir → ilerleme halkası → ana ekrana eklenir → "AÇ"
// =============================================================================
const RING = 62.83;

// AppIcon (PhoneScreen) dışarıdan verilir: aynı ikon her yerde aynı görünsün
function useRows(apps, staff) {
  return STORE_APPS.map((a) => {
    const installed = apps.order.includes(a.id);
    const dl = apps.downloading[a.id];
    const locked = Boolean(a.staff) && !staff;
    return {
      ...a,
      installed,
      loading: !installed && dl != null,
      pct: Math.round(dl || 0),
      locked: locked && !installed && dl == null,
      subTxt: locked && !installed ? 'Yalnızca belediye personeli' : a.sub,
    };
  });
}

function ActionButton({ row, apps, onOpen, big = false }) {
  const cls = big ? 'cs-act big' : 'cs-act';
  if (row.installed)
    return (
      <button className={`${cls} open`} onClick={() => onOpen(row.id)}>
        AÇ
      </button>
    );
  if (row.loading)
    return (
      <button className={`${cls} ring`} onClick={() => apps.cancel(row.id)} aria-label="İndirmeyi durdur">
        <svg width={big ? 28 : 30} height={big ? 28 : 30} viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="10" fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="2.2" />
          <circle cx="12" cy="12" r="10" fill="none" stroke="#4ff3ff" strokeWidth="2.2" strokeLinecap="round" strokeDasharray={`${((row.pct / 100) * RING).toFixed(1)} ${RING}`} transform="rotate(-90 12 12)" />
          <rect x="9" y="9" width="6" height="6" rx="1.2" fill="#4ff3ff" />
        </svg>
        {big && <span>%{row.pct}</span>}
      </button>
    );
  if (row.locked)
    return (
      <span className={`${cls} locked`}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
        {big ? 'Yalnızca personel' : 'Personel'}
      </span>
    );
  return (
    <button className={`${cls} get`} onClick={() => apps.install(row.id)} aria-label={`${row.name} uygulamasını indir`}>
      İNDİR
    </button>
  );
}

function Row({ row, apps, onOpen, onDetail, AppIcon }) {
  return (
    <div className="cs-row">
      <button className="cs-row-main" onClick={() => onDetail(row.id)}>
        <AppIcon id={row.id} size={60} />
        <span className="cs-row-txt">
          <b>{row.name}</b>
          <small>{row.subTxt}</small>
        </span>
      </button>
      <ActionButton row={row} apps={apps} onOpen={onOpen} />
    </div>
  );
}

function Detail({ row, apps, onOpen, AppIcon }) {
  return (
    <div className="cs-detail">
      <div className="cs-detail-head">
        <AppIcon id={row.id} size={104} />
        <div className="cs-detail-meta">
          <h2>{row.name}</h2>
          <p>{row.subTxt}</p>
          <ActionButton row={row} apps={apps} onOpen={onOpen} big />
        </div>
      </div>
      <div className="cs-info">
        {[
          ['KATEGORİ', row.cat],
          ['BOYUT', row.size],
          ['YAŞ', '12+'],
          ['YAPIMCI', 'Neon'],
        ].map(([k, v]) => (
          <div key={k}>
            <small>{k}</small>
            <b>{v}</b>
          </div>
        ))}
      </div>
      {row.locked && <p className="cs-warn">Bu uygulamayı yalnızca belediyede çalışanlar indirebilir. Belediyede bir göreve gelince İNDİR açılır.</p>}
      <p className="cs-desc">{row.desc}</p>
      <h3>Neler var?</h3>
      <div className="cs-feats">
        {row.feats.map((t) => (
          <div key={t} className="cs-feat">
            <span aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </span>
            {t}
          </div>
        ))}
      </div>
      <p className="cs-foot">Silersen verilerin kaybolmaz; Cappstore’dan tekrar indirdiğinde her şey kaldığı yerden devam eder.</p>
    </div>
  );
}

export default function CappstoreScreen({ apps, staff, detail, onDetail, onOpenApp, AppIcon }) {
  const [tab, setTab] = useState('bugun');
  const rows = useRows(apps, staff);
  const row = detail ? rows.find((r) => r.id === detail) : null;
  if (row) return <Detail row={row} apps={apps} onOpen={onOpenApp} AppIcon={AppIcon} />;
  const date = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()).toLocaleUpperCase('tr-TR');
  const fab = rows.find((r) => r.id === 'fabrika');
  return (
    <div className="cs-root">
      <div className="cs-scroll">
        <div className="cs-date">{date}</div>
        <h1 className="cs-h1">{tab === 'bugun' ? 'Bugün' : 'Uygulamalar'}</h1>
        {tab === 'bugun' ? (
          <>
            <button className="cs-hero" onClick={() => onDetail('fabrika')}>
              <div className="cs-hero-top">
                <small>YENİ · İŞ ARAÇLARI</small>
                <strong>
                  Fabrikan artık
                  <br />
                  cebinde.
                </strong>
                <span>Üretimi, makineleri ve hisseleri haritaya dönmeden yönet.</span>
              </div>
              <div className="cs-hero-bar">
                <AppIcon id="fabrika" size={44} />
                <span className="cs-hero-name">
                  <b>Fabrika</b>
                  <small>{STORE_BY_ID.fabrika.sub}</small>
                </span>
                <em>{fab.installed ? 'AÇ' : fab.loading ? `%${fab.pct}` : 'İNDİR'}</em>
              </div>
            </button>
            <div className="cs-duo">
              <button className="cs-card violet" onClick={() => onDetail('isletme')}>
                <AppIcon id="isletme" size={40} />
                <b>Bütün işletmelerin tek listede</b>
                <small>Günlük kazancı bir bakışta</small>
              </button>
              <button className="cs-card green" onClick={() => onDetail('futbol')}>
                <AppIcon id="futbol" size={40} />
                <b>Stadyuma gitmeden takımını yönet</b>
                <small>Kadro, maçlar, ligler</small>
              </button>
            </div>
            <div className="cs-sec-head">
              <h2>Neon Şehir uygulamaları</h2>
              <button onClick={() => setTab('uygulamalar')}>Tümü</button>
            </div>
          </>
        ) : (
          <p className="cs-sub">Neon Şehir tarafından · {STORE_APPS.length} uygulama</p>
        )}
        <div className="cs-list">
          {rows.map((r) => (
            <Row key={r.id} row={r} apps={apps} onOpen={onOpenApp} onDetail={onDetail} AppIcon={AppIcon} />
          ))}
        </div>
      </div>
      <nav className="cs-tabs">
        <button className={tab === 'bugun' ? 'on' : ''} onClick={() => setTab('bugun')} aria-pressed={tab === 'bugun'}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="4" y="4" width="16" height="16" rx="4" />
            <path d="M8 9h8M8 13h5" />
          </svg>
          Bugün
        </button>
        <button className={tab === 'uygulamalar' ? 'on' : ''} onClick={() => setTab('uygulamalar')} aria-pressed={tab === 'uygulamalar'}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="4" y="4" width="6.5" height="6.5" rx="1.8" />
            <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8" />
            <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8" />
            <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8" />
          </svg>
          Uygulamalar
        </button>
      </nav>
    </div>
  );
}
