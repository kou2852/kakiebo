import { useState, useMemo, useRef } from 'react';
import { useData } from '../../contexts/DataContext';
import { fa } from '../../utils/format';
import { calcBalances, accountBalance, getPeriodRange } from '../../utils/bookkeeping';
import PeriodBar from '../Dashboard/PeriodBar';
import InfoTip from '../Common/InfoTip';
import ExportMenu from '../Common/ExportMenu';
import ReportPrintHeader from '../Common/ReportPrintHeader';
import { downloadCSV } from '../../utils/csv';
import { downloadElementPDF } from '../../utils/pdf';

function ReportRow({ label, amount, indent, sub, grand, color }) {
  const cls = grand ? 'rr gt' : sub ? 'rr sub' : indent ? 'rr ind' : 'rr';
  return (
    <div className={cls} style={color ? { color } : undefined}>
      <span>{label}</span>
      <span className="ra" style={color ? { color } : undefined}>{fa(amount)}</span>
    </div>
  );
}

function DiffBadge({ current, previous }) {
  const d = current - previous;
  if (Math.abs(d) < 1) return null;
  return (
    <span style={{ fontSize: 10, color: d >= 0 ? 'var(--grn)' : 'var(--red)', marginLeft: 4 }}>
      {d >= 0 ? '▲' : '▼'}{fa(Math.abs(d))}
    </span>
  );
}

export default function BSPage() {
  const { journals, accounts, loading } = useData();
  const [period, setPeriod] = useState('month');
  const [custom, setCustom] = useState({ start: '', end: '' });

  const { start, end } = useMemo(() => getPeriodRange(period, custom), [period, custom]);

  // BS は期末時点の累計残高
  const bal = useMemo(() => calcBalances(journals.filter((j) => j.date <= end), accounts), [journals, accounts, end]);
  // 前期比較用
  const prevEnd = useMemo(() => {
    const d = new Date(start);
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }, [start]);
  const prevBal = useMemo(() => calcBalances(journals.filter((j) => j.date <= prevEnd), accounts), [journals, accounts, prevEnd]);

  const renderSection = (type, title) => {
    const accts = accounts
      .filter((a) => a.type === type)
      .sort((a, b) => accountBalance(b.id, accounts, bal) - accountBalance(a.id, accounts, bal))
      .filter((a) => Math.abs(accountBalance(a.id, accounts, bal)) > 0.01);
    const total = accounts.filter((a) => a.type === type).reduce((s, a) => s + accountBalance(a.id, accounts, bal), 0);

    return { accts, total, el: (
      <>
        {accts.map((a) => (
          <div key={a.id} className="rr ind">
            <span>
              {a.name}
              <DiffBadge current={accountBalance(a.id, accounts, bal)} previous={accountBalance(a.id, accounts, prevBal)} />
            </span>
            <span className="ra">{fa(accountBalance(a.id, accounts, bal))}</span>
          </div>
        ))}
        <ReportRow label={title} amount={total} grand color="var(--ac)" />
      </>
    )};
  };

  const reportRef = useRef(null);

  if (loading) return <p className="nd">読み込み中...</p>;

  const asset = renderSection('asset', '資産合計');
  const liability = renderSection('liability', '負債合計');
  const equity = renderSection('equity', '純資産合計');

  const balOf = (id) => Math.round(accountBalance(id, accounts, bal));
  const exportCSV = () => {
    const rows = [['区分', '勘定科目', '残高']];
    asset.accts.forEach((a) => rows.push(['資産', a.name, balOf(a.id)]));
    rows.push(['資産', '資産合計', Math.round(asset.total)]);
    liability.accts.forEach((a) => rows.push(['負債', a.name, balOf(a.id)]));
    rows.push(['負債', '負債合計', Math.round(liability.total)]);
    equity.accts.forEach((a) => rows.push(['純資産', a.name, balOf(a.id)]));
    rows.push(['純資産', '純資産合計', Math.round(equity.total)]);
    rows.push(['', '負債・純資産合計', Math.round(liability.total + equity.total)]);
    downloadCSV(`kurofukubo_貸借対照表_${end}.csv`, rows);
  };
  const exportPDF = () => downloadElementPDF(reportRef.current, `kurofukubo_貸借対照表_${end}.pdf`);

  return (
    <div>
      <div className="pg-header pg-header-row">
        <div>
          <div className="pg-title">貸借対照表<InfoTip text="ある時点で「持っているもの（資産）」と「借りているもの（負債）」、その差の純資産を一覧にしたもの。今の財産状況がわかります。" /></div>
          <div className="pg-sub">資産・負債・純資産のバランスを表示します</div>
        </div>
        <ExportMenu onCSV={exportCSV} onPDF={exportPDF} />
      </div>
      <PeriodBar value={period} onChange={setPeriod} custom={custom} onCustomChange={setCustom} />
      <div ref={reportRef}>
      <ReportPrintHeader title="貸借対照表" start={start} end={end} />
      <div className="rpt-grid">
        <div className="card">
          <div className="rpt-sec">資産の部</div>
          {asset.el}
        </div>
        <div>
          <div className="card mb-10">
            <div className="rpt-sec">負債の部</div>
            {liability.el}
          </div>
          <div className="card">
            <div className="rpt-sec">純資産の部</div>
            {equity.el}
            <ReportRow label="負債・純資産合計" amount={liability.total + equity.total} grand />
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
