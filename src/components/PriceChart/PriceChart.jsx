const WIDTH = 300;
const HEIGHT = 80;
const PADDING = 4;

export default function PriceChart({ points, color = '#19e8ff' }) {
  if (!points || points.length < 2) {
    return <p className="price-chart-empty">Henüz yeterli veri yok.</p>;
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  const coords = points.map((p, i) => {
    const x = PADDING + (i / (points.length - 1)) * (WIDTH - PADDING * 2);
    const y = HEIGHT - PADDING - ((p - min) / range) * (HEIGHT - PADDING * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const linePath = `M${coords.join(' L')}`;
  const areaPath = `${linePath} L${WIDTH - PADDING},${HEIGHT} L${PADDING},${HEIGHT} Z`;

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="price-chart" preserveAspectRatio="none">
      <path d={areaPath} fill={color} opacity="0.12" />
      <path d={linePath} fill="none" stroke={color} strokeWidth="2" />
    </svg>
  );
}
