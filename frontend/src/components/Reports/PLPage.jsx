import { useState, useMemo, useRef } from 'react';
import { useData } from '../../contexts/DataContext';
import { fa } from '../../utils/format';
import { calcBalances, accountBalance, filterByPeriod, getPeriodRange } from '../../utils/bookkeeping';
import PeriodBar from '../Dashboard/PeriodBar';
import InfoTip from '../Common/InfoTip';
import ExportMenu from '../Common/ExportMenu';
import ReportPrintHeader from '../Common/ReportPrintHeader';
import { downloadCSV } from '../../utils/csv';
import { downloadElementPDF } from '../../utils/pdf';

export default function PLPage() {
  const { journals, accounts, loading } = useData();
  const [period, setPeriod] = useState('month');
  const [custom, setCustom] = useState({ start: '', end: '' });

  const { start, end } = useMemo(() => getPeriodRange(period, custom), [period, custom]);

  const periodJournals = useMemo(() => filterByPeriod(journals, start, end), [journals, start, end]);
  const bal = useMemo(() => calcBalances(periodJournals, accounts), [periodJournals, accounts]);

  // 前期比較
  const prevBal = useMemo(() => {
    const dur = new Date(end) - new Date(start);
    const prevEnd = new Date(new Date(start) - 1);
    const prevStart = new Date(prevEnd - dur);
    const pj = journals.filter((j) => j.date >= prevStart.toISOString().slice(0, 10) && j.date <= prevEnd.toISOString().slice(0, 10));
    return calcBalances(pj, accounts);
  }, [journals, accounts, start, end]);

  const totalIncome = accounts.filter((a) => a.type === 'income').reduce((s, a) => s + accountBalance(a.id, accounts, bal), 0);
  const totalExpense = accounts.filter((a) => a.type === 'expense').reduce((s, a) => s + accountBalance(a.id, accounts, bal), 0);
  const net = totalIncome - totalExpense;

  const incomeAccts = accounts.filter((a) => a.type === 'income' && Math.abs(accountBalance(a.id, accounts, bal)) > 0.01)
    .sort((a, b) => accountBalance(b.id, accounts, bal) - accountBalance(a.id, accounts, bal));
  const expenseAccts = accounts.filter((a) => a.type === 'expense' && Math.abs(accountBalance(a.id, accounts, bal)) > 0.01)
    .sort((a, b) => accountBalance(b.id, accounts, bal) - accountBalance(a.id, accounts, bal));

  const DiffBadge = ({ id }) => {
    const d = accountBalance(id, accounts, bal) - accountBalance(id, accounts, prevBal);
    if (Math.abs(d) < 1) return null;
    return <span style={{ fontSize: 10, color: d >= 0 ? 'var(--grn)' : 'var(--red)', marginLeft: 4 }}>{d >= 0 ? '▲' : '▼'}{fa(Math.abs(d))}</span>;
  };

  const reportRef = useRef(null);
  const balOf = (id) => Math.round(accountBalance(id, accounts, bal));
  const exportCSV = () => {
    const rows = [['区分', '勘定科目', '金額']];
    incomeAccts.forEach((a) => rows.push(['収益', a.name, balOf(a.id)]));
    rows.push(['収益', '収益合計', Math.round(totalIncome)]);
    expenseAccts.forEach((a) => rows.push(['費用', a.name, balOf(a.id)]));
    rows.push(['費用', '費用合計', Math.round(totalExpense)]);
    rows.push(['', net >= 0 ? '当期純利益' : '当期純損失', Math.round(net)]);
    downloadCSV(`kurofukubo_損益計算書_${start}_${end}.csv`, rows);
  };
  const exportPDF = () => downloadElementPDF(reportRef.current, `kurofukubo_損益計算書_${start}_${end}.pdf`);

  if (loading) return <p className="nd">読み込み中...</p>;

  return (
    <div>
      <div className="pg-header pg-header-row">
        <div>
          <div className="pg-title">損益計算書<InfoTip text="一定期間の「収入（収益）」と「支出（費用）」、その差の利益をまとめたもの。期間中にいくら稼ぎ・使ったかがわかります。" /></div>
          <div className="pg-sub">期間の収入と支出をまとめます</div>
        </div>
        <ExportMenu onCSV={exportCSV} onPDF={exportPDF} />
      </div>
      <PeriodBar value={period} onChange={setPeriod} custom={custom} onCustomChange={setCustom} />
      <div style={{ maxWidth: 560 }} ref={reportRef}>
        <ReportPrintHeader title="損益計算書" start={start} end={end} />
        <div className="card">
          <div className="rpt-sec">収益の部</div>
          {incomeAccts.map((a) => (
            <div key={a.id} className="rr ind">
              <span>{a.name}<DiffBadge id={a.id} /></span>
              <span className="ra">{fa(accountBalance(a.id, accounts, bal))}</span>
            </div>
          ))}
          <div className="rr sub"><span>収益合計</span><span className="ra" style={{ color: 'var(--grn)' }}>{fa(totalIncome)}</span></div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--bd)', margin: '10px 0' }} />

          <div className="rpt-sec">費用の部</div>
          {expenseAccts.map((a) => (
            <div key={a.id} className="rr ind">
              <span>{a.name}<DiffBadge id={a.id} /></span>
              <span className="ra">{fa(accountBalance(a.id, accounts, bal))}</span>
            </div>
          ))}
          <div className="rr sub"><span>費用合計</span><span className="ra" style={{ color: 'var(--red)' }}>{fa(totalExpense)}</span></div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--bd)', margin: '10px 0' }} />

          <div className="rr gt">
            <span>{net >= 0 ? '当期純利益' : '当期純損失'}</span>
            <span className="ra" style={{ color: net >= 0 ? 'var(--grn)' : 'var(--red)' }}>{fa(Math.abs(net))}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
