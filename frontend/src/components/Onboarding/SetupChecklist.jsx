import { useState } from 'react';
import { useData } from '../../contexts/DataContext';
import { useUI } from '../../contexts/UIContext';

const DISMISS_KEY = 'kk_setup_dismissed';
const REPORT_KEY = 'kk_setup_report';

// ダッシュボード上部の初期セットアップ進捗。全完了 or 手動非表示で消える。
export default function SetupChecklist() {
  const { wallets, journals } = useData();
  const { navigate } = useUI();
  const [dismissed, setDismissed] = useState(() => !!localStorage.getItem(DISMISS_KEY));
  const [reportSeen, setReportSeen] = useState(() => !!localStorage.getItem(REPORT_KEY));

  const steps = [
    { key: 'wallet', label: '口座を登録する', done: wallets.length > 0, cta: '口座を登録', page: 'accounts' },
    { key: 'journal', label: '最初の取引を記帳する', done: journals.length > 0, cta: '記帳する', page: 'journal' },
    { key: 'report', label: 'レポートで全体像を見る', done: reportSeen, cta: '貸借対照表を見る', page: 'bs' },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  if (dismissed || doneCount === steps.length) return null;

  const go = (step) => {
    if (step.key === 'report') { localStorage.setItem(REPORT_KEY, '1'); setReportSeen(true); }
    navigate(step.page);
  };

  const dismiss = () => { localStorage.setItem(DISMISS_KEY, '1'); setDismissed(true); };

  return (
    <div className="card" style={{ borderColor: 'var(--ac)', marginBottom: 14, position: 'relative' }}>
      <button onClick={dismiss} aria-label="閉じる" style={{
        position: 'absolute', top: 8, right: 10, background: 'none', border: 'none',
        color: 'var(--tx3)', fontSize: 16, lineHeight: 1, cursor: 'pointer',
      }}>×</button>
      <div className="card-title" style={{ marginBottom: 2 }}>はじめかた（{doneCount}/{steps.length}）</div>
      <p style={{ fontSize: 12, color: 'var(--tx3)', margin: '0 0 12px' }}>
        この3ステップで家計簿の準備が整います。
      </p>
      <div style={{ display: 'grid', gap: 8 }}>
        {steps.map((s) => (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              flexShrink: 0, width: 20, height: 20, borderRadius: '50%', fontSize: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: s.done ? 'var(--grn)' : 'var(--bg4)',
              color: s.done ? '#fff' : 'var(--tx3)',
              border: s.done ? 'none' : '1px solid var(--bd)',
            }}>{s.done ? '✓' : ''}</span>
            <span style={{ flex: 1, fontSize: 13, color: s.done ? 'var(--tx3)' : 'var(--tx)', textDecoration: s.done ? 'line-through' : 'none' }}>
              {s.label}
            </span>
            {!s.done && <button className="btn btn-p btn-s" onClick={() => go(s)}>{s.cta} →</button>}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12, borderTop: '1px solid var(--bd)', paddingTop: 12 }}>
        <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 6 }}>記帳はこれだけ（動画）</div>
        <img src="/howto-2-entry.gif" alt="一行で記帳する操作" loading="lazy"
          style={{ width: '100%', maxWidth: 460, borderRadius: 8, border: '1px solid var(--bd)', display: 'block' }} />
      </div>
    </div>
  );
}
