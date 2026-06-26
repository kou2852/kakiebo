import { getPeriodRange } from '../../utils/bookkeeping';

const MODES = [
  { id: 'month',  label: '今月' },
  { id: 'lastm',  label: '先月' },
  { id: 'last2m', label: '先々月' },
  { id: 'year',   label: '今年' },
  { id: 'all',    label: '全期間' },
  { id: 'custom', label: '期間指定' },
];

// 現在表示中の期間を「YYYY年M月」などの分かりやすいラベルにする
function periodLabel(value, custom) {
  const { start, end } = getPeriodRange(value, custom);
  if (value === 'all') return '全期間';
  if (value === 'year') return `${start.slice(0, 4)}年`;
  if (value === 'custom') return (custom.start && custom.end) ? `${custom.start} 〜 ${custom.end}` : '期間を指定してください';
  // month / lastm / last2m → 同一月レンジ
  return `${start.slice(0, 4)}年${parseInt(start.slice(5, 7), 10)}月`;
}

export default function PeriodBar({ value, onChange, custom, onCustomChange, inline = false }) {
  return (
    <div style={{ marginBottom: inline ? 0 : 18 }}>
      {!inline && (
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--tx)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ opacity: 0.7 }}>📅</span>
          <span>{periodLabel(value, custom)}</span>
          <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--tx3)' }}>を表示中</span>
        </div>
      )}
      <div className="pbar">
        {MODES.map((m) => (
          <button
            key={m.id}
            className={`pbtn ${value === m.id ? 'on' : ''}`}
            onClick={() => onChange(m.id)}
          >
            {m.label}
          </button>
        ))}
        {value === 'custom' && (
          <>
            <span style={{ color: 'var(--tx3)' }}>|</span>
            <input
              type="date"
              className="pdt"
              value={custom.start}
              onChange={(e) => onCustomChange({ ...custom, start: e.target.value })}
            />
            <span style={{ color: 'var(--tx3)' }}>〜</span>
            <input
              type="date"
              className="pdt"
              value={custom.end}
              onChange={(e) => onCustomChange({ ...custom, end: e.target.value })}
            />
          </>
        )}
      </div>
    </div>
  );
}
