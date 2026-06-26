import { useState } from 'react';
import { fa } from '../../utils/format';

const W = 480, H = 180, PL = 40, PR = 10, PT = 10, PB = 30;

export default function TrendChart({ data }) {
  const [tooltip, setTooltip] = useState(null);

  if (!data.length) return <p className="nd">データなし</p>;

  const maxVal = Math.max(1, ...data.map((d) => Math.max(d.income, d.expense)));
  const cw = (W - PL - PR) / data.length;
  const bw = cw * 0.3;

  const handleMouse = (e, label, value) => {
    setTooltip({ label, value: fa(value), x: e.clientX, y: e.clientY });
  };
  const handleMove = (e) => {
    if (tooltip) setTooltip((t) => t ? { ...t, x: e.clientX, y: e.clientY } : null);
  };
  const handleLeave = () => setTooltip(null);

  // Y軸ラベル
  const ySteps = [0, 0.25, 0.5, 0.75, 1];
  const gridLines = ySteps.map((s, i) => {
    const v = maxVal * s;
    const y = H - PB - (H - PT - PB) * s;
    const label = v >= 10000 ? (v / 10000).toFixed(0) + '万' : Math.round(v).toString();
    return (
      <g key={i}>
        <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="var(--bd)" strokeWidth="0.5" />
        <text x={PL - 4} y={y + 3} textAnchor="end" fill="var(--tx3)" fontSize="9"
          fontFamily="'JetBrains Mono', monospace">{label}</text>
      </g>
    );
  });

  const bars = data.map((d, i) => {
    const x = PL + i * cw + cw / 2;
    const hI = d.income / maxVal * (H - PT - PB);
    const hE = d.expense / maxVal * (H - PT - PB);
    return (
      <g key={i}>
        <rect className="bar-hover" x={x - bw - 1} y={H - PB - hI} width={bw} height={hI}
          fill="var(--grn)" rx="2" opacity=".8"
          onMouseEnter={(e) => handleMouse(e, `${d.label} 収入`, d.income)}
          onMouseMove={handleMove}
          onMouseLeave={handleLeave} />
        <rect className="bar-hover" x={x + 1} y={H - PB - hE} width={bw} height={hE}
          fill="var(--red)" rx="2" opacity=".8"
          onMouseEnter={(e) => handleMouse(e, `${d.label} 支出`, d.expense)}
          onMouseMove={handleMove}
          onMouseLeave={handleLeave} />
        <text x={x} y={H - PB + 14} textAnchor="middle" fill="var(--tx3)" fontSize="10">
          {d.label}
        </text>
      </g>
    );
  });

  return (
    <div style={{ position: 'relative' }}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W }}>
        {gridLines}
        {bars}
        {/* 凡例 */}
        <rect x={W - PR - 80} y={PT} width="8" height="8" fill="var(--grn)" rx="1" />
        <text x={W - PR - 68} y={PT + 8} fill="var(--tx3)" fontSize="9">収入</text>
        <rect x={W - PR - 38} y={PT} width="8" height="8" fill="var(--red)" rx="1" />
        <text x={W - PR - 26} y={PT + 8} fill="var(--tx3)" fontSize="9">支出</text>
      </svg>

      {tooltip && (
        <div className="chart-tip show" style={{ left: tooltip.x + 12, top: tooltip.y - 50 }}>
          <div className="chart-tip-label">{tooltip.label}</div>
          <div><span className="chart-tip-val">{tooltip.value}</span></div>
        </div>
      )}
    </div>
  );
}
