import { useState, useRef } from 'react';
import { fa, esc } from '../../utils/format';

const R = 78, CX = 96, CY = 96, SZ = 192;

const MASK = '¥****';

export default function PieChart({ items, masked = false }) {
  const [tooltip, setTooltip] = useState(null);
  const svgRef = useRef(null);

  const total = items.reduce((s, i) => s + i.value, 0);

  if (total <= 0 || !items.length) {
    return <p className="nd" style={{ textAlign: 'center', padding: '24px 0' }}>データなし</p>;
  }

  const positive = items.filter((i) => i.value > 0);
  const totalStr = total >= 1e7 ? (total / 1e8).toFixed(2) + '億'
    : total >= 1e5 ? (total / 1e4).toFixed(0) + '万'
    : fa(total);

  const handleMouse = (e, item, pct) => {
    setTooltip({ label: item.label, value: masked ? MASK : fa(item.value), pct: masked ? '**' : pct, x: e.clientX, y: e.clientY });
  };
  const handleMove = (e) => {
    if (tooltip) setTooltip((t) => t ? { ...t, x: e.clientX, y: e.clientY } : null);
  };
  const handleLeave = () => setTooltip(null);

  // パスを生成
  let paths;
  if (positive.length === 1) {
    const i = positive[0];
    const pct = (i.value / total * 100).toFixed(1);
    paths = (
      <circle
        className="pie-slice"
        cx={CX} cy={CY} r={R} fill={i.color} opacity=".9"
        onMouseEnter={(e) => handleMouse(e, i, pct)}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
      />
    );
  } else {
    let startAngle = -Math.PI / 2;
    paths = positive.map((item, idx) => {
      const fraction = item.value / total;
      const angle = fraction * 2 * Math.PI;
      const endAngle = startAngle + angle;
      const largeArc = angle > Math.PI ? 1 : 0;
      const x1 = CX + R * Math.cos(startAngle);
      const y1 = CY + R * Math.sin(startAngle);
      const x2 = CX + R * Math.cos(endAngle);
      const y2 = CY + R * Math.sin(endAngle);
      const pct = (fraction * 100).toFixed(1);
      const d = `M${CX},${CY} L${x1.toFixed(2)},${y1.toFixed(2)} A${R},${R} 0 ${largeArc} 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z`;
      startAngle = endAngle;
      return (
        <path
          key={idx}
          className="pie-slice"
          d={d}
          fill={item.color}
          stroke="var(--bg0)"
          strokeWidth="1.5"
          opacity=".9"
          onMouseEnter={(e) => handleMouse(e, item, pct)}
          onMouseMove={handleMove}
          onMouseLeave={handleLeave}
        />
      );
    });
  }

  return (
    <div className="pie-w">
      <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${SZ} ${SZ}`} width={SZ} height={SZ}>
        {paths}
        <circle cx={CX} cy={CY} r={R * 0.52} fill="var(--dh)" />
        <text x={CX} y={CY} textAnchor="middle" fill="var(--tx)" fontSize="13"
          fontFamily="'JetBrains Mono', monospace" dy="1">
          {masked ? MASK : totalStr}
        </text>
      </svg>

      {/* 凡例 */}
      <div className="pie-leg">
        {positive.slice(0, 10).map((item, i) => {
          const pct = total > 0 ? (item.value / total * 100).toFixed(1) : '0';
          return (
            <div key={i} className="pie-li">
              <div className="pie-dot" style={{ background: item.color }} />
              <span className="pie-nm">{item.label}</span>
              <span className="pie-v">{masked ? MASK : fa(item.value)}</span>
              <span className="pie-p">{masked ? '' : `(${pct}%)`}</span>
            </div>
          );
        })}
      </div>

      {/* ツールチップ */}
      {tooltip && (
        <div className="chart-tip show" style={{
          left: tooltip.x + 12,
          top: tooltip.y - 56,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 3 }}>{tooltip.label}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
            <span style={{ color: 'var(--tx3)' }}>金額</span>
            <span className="mono">{tooltip.value}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
            <span style={{ color: 'var(--tx3)' }}>構成比</span>
            <span>{tooltip.pct}%</span>
          </div>
        </div>
      )}
    </div>
  );
}
