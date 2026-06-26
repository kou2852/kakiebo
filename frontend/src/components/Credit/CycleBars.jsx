import { useState } from 'react';
import { fa } from '../../utils/format';

const W = 480, H = 170, PL = 40, PR = 10, PT = 12, PB = 28;
const COLOR = { settled: 'var(--grn)', unsettled: 'var(--red)', open: 'var(--ac)', none: 'var(--bd)' };
const LABEL = { settled: '引落済', unsettled: '未引落', open: '締め前', none: '利用なし' };
const mlabel = (s) => `${+s.split('-')[1]}月`;

// 締めサイクルごとの利用額を棒グラフで表示（古い→新しい）。状態で色分け。
export default function CycleBars({ cycles }) {
  const [tip, setTip] = useState(null);
  const data = [...cycles].reverse();
  const maxVal = Math.max(1, ...data.map((c) => c.usage));

  if (!data.some((c) => c.usage > 0)) {
    return <p className="nd" style={{ textAlign: 'center', padding: '24px 0' }}>データなし</p>;
  }

  const cw = (W - PL - PR) / data.length;
  const bw = Math.min(40, cw * 0.55);

  const move = (e) => setTip((t) => t ? { ...t, x: e.clientX, y: e.clientY } : null);
  const leave = () => setTip(null);

  const ySteps = [0, 0.25, 0.5, 0.75, 1];
  const grid = ySteps.map((s, i) => {
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

  const bars = data.map((c, i) => {
    const x = PL + i * cw + cw / 2;
    const h = c.usage > 0 ? c.usage / maxVal * (H - PT - PB) : 0;
    return (
      <g key={i}>
        <rect className="bar-hover" x={x - bw / 2} y={H - PB - h} width={bw} height={h}
          fill={COLOR[c.status] || 'var(--ac)'} rx="2" opacity=".85"
          onMouseEnter={(e) => setTip({
            label: `${mlabel(c.periodEnd)}締め（${LABEL[c.status] || ''}）`,
            value: fa(c.usage), x: e.clientX, y: e.clientY,
          })}
          onMouseMove={move} onMouseLeave={leave} />
        <text x={x} y={H - PB + 14} textAnchor="middle" fill="var(--tx3)" fontSize="10">
          {mlabel(c.periodEnd)}
        </text>
      </g>
    );
  });

  return (
    <div style={{ position: 'relative' }}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W }} role="img" aria-label="サイクル別の利用額グラフ">
        {grid}
        {bars}
      </svg>
      {tip && (
        <div className="chart-tip show" style={{ left: tip.x + 12, top: tip.y - 50 }}>
          <div className="chart-tip-label">{tip.label}</div>
          <div><span className="chart-tip-val">{tip.value}</span></div>
        </div>
      )}
    </div>
  );
}
