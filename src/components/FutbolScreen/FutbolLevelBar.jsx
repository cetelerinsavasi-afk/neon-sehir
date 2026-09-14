import './FutbolLevelBar.css';

// FutbolLevelBar — menajerlik seviyesini SAYIYLA DEĞİL, görsel bir
// ilerleme çubuğuyla anlatır: çubuğun ortası "bu seviyeye yeni geçtin"
// (streak 0), sağ ucu "bir üst seviyeye çok yaklaştın", sol ucu "bir alt
// seviyeye çok yaklaştın" demek. Dolgu, streak pozitifken merkezden sağa,
// negatifken merkezden sola büyür — oranı streak/threshold.
export default function FutbolLevelBar({ level, streak, threshold }) {
  const ratio = threshold > 0 ? Math.max(-1, Math.min(1, streak / threshold)) : 0;
  const fillPct = Math.abs(ratio) * 50; // yarım çubuğun (merkez→uç) yüzdesi
  const positive = ratio >= 0;

  return (
    <div className="futbol-level-bar-wrap">
      <span className="futbol-level-badge">Seviye {level}</span>
      <div className="futbol-level-track">
        <div className="futbol-level-center" />
        <div
          className={`futbol-level-fill ${positive ? 'pos' : 'neg'}`}
          style={positive ? { left: '50%', width: `${fillPct}%` } : { right: '50%', width: `${fillPct}%` }}
        />
      </div>
    </div>
  );
}
