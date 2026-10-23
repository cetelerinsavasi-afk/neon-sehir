import { usePlayer } from '../../hooks/usePlayer';
import { istanbulDateKey } from '../../lib/istanbulTime';
import { RISKY_PRICE, SAFE_PRICE, SAFE_GANG_CUT, SAFE_DAILY_LIMIT } from './shadyDeal';
import './ShadyDealPanel.css';

// v103 — Şüpheli Adam: iki satış şekli yan yana. Az yazı, çok görsel:
// solda riskli (5.000, yakalanma + şüphe), sağda güvenli (2.500 + çetene 500,
// risk yok, günde 10). Park (2D) ve Park (3D) aynı paneli kullanır.
// Sunucu: functions/index.js sellContrabandAtPark (mode: 'risky' | 'safe').
const fmt = (n) => Number(n || 0).toLocaleString('tr-TR');

function Coin() {
  return <span className="gold-coin-icon sd-coin" />;
}

export default function ShadyDealPanel({ qty, busy, onSell }) {
  const { player } = usePlayer();
  const suspicion = Math.max(0, Math.min(100, Math.round(Number(player?.suspicion || 0))));
  const risk = Math.max(1, suspicion);
  const today = istanbulDateKey();
  const used = player?.parkSafeSales?.day === today ? Number(player.parkSafeSales.count || 0) : 0;
  const left = Math.max(0, SAFE_DAILY_LIMIT - used);
  const noGoods = qty < 1;

  return (
    <div className="sd">
      <div className="sd-stock">
        <span>💊</span>
        <b>{fmt(qty)}</b>
        <span className="sd-dim">malın var</span>
      </div>

      <div className="sd-grid">
        {/* RİSKLİ */}
        <div className="sd-card risky">
          <span className="sd-tag">🎲 Riskli</span>
          <div className="sd-amount">
            <Coin />
            <b>{fmt(RISKY_PRICE)}</b>
          </div>
          <div className="sd-amount-sub">&nbsp;</div>
          <ul className="sd-rows">
            <li className="bad">
              <span>🚨</span> Yakalanabilirsin
            </li>
            <li className="bad">
              <span>📈</span> Şüphe +5
            </li>
          </ul>
          <div className="sd-meter" aria-label={`Yakalanma ihtimali yüzde ${risk}`}>
            <i style={{ width: `${risk}%` }} />
            <em>%{risk} risk</em>
          </div>
          <button className="sd-btn risky" disabled={noGoods || Boolean(busy)} onClick={() => onSell('risky')}>
            {busy === 'risky' ? '…' : noGoods ? 'Malın yok' : 'Sat'}
          </button>
        </div>

        {/* GÜVENLİ */}
        <div className="sd-card safe">
          <span className="sd-tag">🛡️ Güvenli</span>
          <div className="sd-amount">
            <Coin />
            <b>{fmt(SAFE_PRICE)}</b>
          </div>
          <div className="sd-amount-sub">
            🤝 çetene <b>+{fmt(SAFE_GANG_CUT)}</b>
          </div>
          <ul className="sd-rows">
            <li className="good">
              <span>✅</span> Yakalanma yok
            </li>
            <li className="good">
              <span>😌</span> Şüphe artmaz
            </li>
          </ul>
          <div className="sd-pips" aria-label={`Bugün ${used} / ${SAFE_DAILY_LIMIT}`}>
            {Array.from({ length: SAFE_DAILY_LIMIT }, (_, i) => (
              <i key={i} className={i < used ? 'on' : ''} />
            ))}
            <em>
              {used}/{SAFE_DAILY_LIMIT}
            </em>
          </div>
          <button className="sd-btn safe" disabled={noGoods || left < 1 || Boolean(busy)} onClick={() => onSell('safe')}>
            {busy === 'safe' ? '…' : noGoods ? 'Malın yok' : left < 1 ? 'Yarın ⏳' : 'Sat'}
          </button>
        </div>
      </div>
    </div>
  );
}
