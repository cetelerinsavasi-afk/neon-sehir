// v68 — DEVAM EDEN SAVAŞLAR (salt izleme).
// Herkes izleyebilir — çetesi olmayan oyuncu da. Katılma yok. Sunucu (watchWars)
// gizli bilgileri hiç göndermez: bahis tutarı, tır yükü, haraç/rüşvet tutarı yok.
// Liste 20 saniyede bir kendiliğinden yenilenir.
import { useCallback, useEffect, useState } from 'react';
import { useGang, useNow } from './GangContext';
import { Btn, Card, Deadline, Empty, Logo, Sheet } from './ui';
import { fmt, productOf } from './gangConstants';

const KIND = {
  trade: { icon: '🛣️', label: 'Ticaret yolu savaşı' },
  bet: { icon: '🎲', label: 'Bahisli savaş' },
  truck: { icon: '🚛', label: 'Tır saldırısı' },
};

function SideRow({ s, top }) {
  return (
    <div className={`gx-watch-side${top ? ' top' : ''}`}>
      {s.role === 'intel' || s.key === 'intel' ? <span className="gx-watch-ico">🕵️</span> : <Logo logo={s.logo} size={22} />}
      <span className="gx-watch-name">
        {s.name || '—'}
        {s.role === 'defender' && <em> · savunma</em>}
        {(s.role === 'attacker' || s.role === 'intel') && <em> · saldırı</em>}
      </span>
      <b className="gx-watch-power">{fmt(s.power)}</b>
    </div>
  );
}

function WarCard({ w }) {
  const k = KIND[w.type] || KIND.trade;
  const sides = [...(w.sides || [])].sort((a, b) => b.power - a.power);
  const max = sides[0]?.power || 0;
  const title = w.type === 'trade' ? `${productOf(w.product)?.emoji || ''} ${productOf(w.product)?.label || ''} yolu` : w.type === 'truck' ? `TIR #${w.truckCode}` : sides.map((s) => s.name).join(' ⚔️ ');
  return (
    <Card className="gx-watch-card">
      <div className="gx-watch-head">
        <span>
          {k.icon} <b>{title}</b>
        </span>
        <Deadline untilMs={w.endsAtMs} label="bitişe" />
      </div>
      <div className="dim gx-mini">{k.label}{w.type === 'bet' ? ' · bahis tutarı gizli' : w.type === 'truck' ? ' · yük gizli' : ''}</div>
      {sides.map((s) => (
        <SideRow key={s.key} s={s} top={max > 0 && s.power === max} />
      ))}
    </Card>
  );
}

export function WatchWarsList({ excludeMine = false }) {
  const { call } = useGang();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const tick = useNow(20_000);
  const load = useCallback(async () => {
    try {
      setData(await call('watchWars', {}));
      setErr(null);
    } catch (e) {
      setErr(e?.message || 'Savaşlar alınamadı.');
    }
  }, [call]);
  useEffect(() => {
    load();
  }, [load, tick]);
  const list = (data?.wars || []).filter((w) => !excludeMine || !w.mine);
  return (
    <div className="gx-stack">
      <p className="dim gx-mini">👁️ Sadece izleme — katılamazsın. Güç değerleri canlı (20 sn'de bir yenilenir); bahis tutarı ve tır yükü gizlidir.</p>
      {err && <p className="gx-err-text">{err}</p>}
      {!data && !err && <p className="dim gx-mini">Yükleniyor…</p>}
      {data && list.length === 0 && <Empty icon="🕊️" text="Şu an devam eden savaş yok." />}
      {list.map((w) => (
        <WarCard key={w.id} w={w} />
      ))}
    </div>
  );
}

export function WatchWarsButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Btn block kind="ghost" onClick={() => setOpen(true)}>
        👁️ Devam eden savaşlar
      </Btn>
      {open && (
        <Sheet title="Devam eden savaşlar" icon="👁️" onClose={() => setOpen(false)}>
          <WatchWarsList excludeMine />
        </Sheet>
      )}
    </>
  );
}
