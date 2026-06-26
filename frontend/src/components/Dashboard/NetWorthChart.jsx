import { useState } from 'react';
import { fa, fas } from '../../utils/format';

const W = 480, H = 190, PL = 52, PR = 12, PT = 16, PB = 26;

// 純資産の推移（折れ線）。負値も扱えるよう min/max からスケール。
export default function NetWorthChart({ data }) {
  const [tip, setTip] = useState(null);
  if (!data.length) return <p className="nd" style={{ textAlign: 'center', padding: '24px 0' }}>データなし</p>;

  const vals = data.map((d) => d.net);
  const max = Math.max(...vals, 0);
  const min = Math.min(...vals, 0);
  const range = (max - min) || 1;
  const x = (i) => PL + (W - PL - PR) * (data.length === 1 ? 0.5 : i / (data.length - 1));
  const y = (v) => H - PB - (H - PT - PB) * ((v - min) / range);
  const pts = data.map((d, i) => `${x(i).toFixed(1)},${y(d.net).toFixed(1)}`).join(' ');
  const area = `${PL},${(H - PB).toFixed(1)} ${pts} ${(W - PR).toFixed(1)},${(H - PB).toFixed(1)}`;

  const ySteps = [0, 0.5, 1];
  const grid = ySteps.map((s, i) => {
    const v = min + range * s;
    const yy = y(v);
    const label = Math.abs(v) >= 10000 ? (v / 10000).toFixed(0) + '万' : Math.round(v).toString();
    return (
      <g key={i}>
        <line x1={PL} y1={yy} x2={W - PR} y2={yy} stroke="var(--bd)" strokeWidth="0.5" />
        <text x={PL - 4} y={yy + 3} textAnchor="end" fill="var(--tx3)" fontSize="9" fontFamily="'JetBrains Mono', monospace">{label}</text>
      </g>
    );
  });

  const move = (e) => setTip((t) => t ? { ...t, x: e.clientX, y: e.clientY } : null);
  const leave = () => setTip(null);

  return (
    <div style={{ position: 'relative' }}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W }} role="img" aria-label="純資産の推移グラフ">
        {grid}
        <polygon points={area} fill="var(--acb)" opacity=".5" />
        <polyline points={pts} fill="none" stroke="var(--ac)" strokeWidth="2" />
        {data.map((d, i) => (
          <circle key={i} cx={x(i)} cy={y(d.net)} r="3.5" fill="var(--ac)"
            onMouseEnter={(e) => setTip({
              label: `${d.label}末`,
              value: (d.net < 0 ? '−' : '') + fa(d.net),
              change: i > 0 ? fas(d.net - data[i - 1].net) : null,
              x: e.clientX, y: e.clientY,
            })}
            onMouseMove={move} onMouseLeave={leave} style={{ cursor: 'pointer' }} />
        ))}
        {data.map((d, i) => (
          <text key={`l${i}`} x={x(i)} y={H - PB + 14} textAnchor="middle" fill="var(--tx3)" fontSize="10">{d.label}</text>
        ))}
      </svg>
      {tip && (
        <div className="chart-tip show" style={{ left: tip.x + 12, top: tip.y - 50 }}>
          <div className="chart-tip-label">{tip.label}</div>
          <div>
            <span className="chart-tip-val">{tip.value}</span>
            {tip.change && <span style={{ marginLeft: 4, fontSize: 11, color: 'var(--tx3)' }}>（前月比 {tip.change}）</span>}
          </div>
        </div>
      )}
    </div>
  );
}
