import { useState, useMemo, useRef } from 'react';
import { useData } from '../../contexts/DataContext';
import { fa, fas } from '../../utils/format';
import { computeCashFlow, filterByPeriod, getPeriodRange } from '../../utils/bookkeeping';
import PeriodBar from '../Dashboard/PeriodBar';
import InfoTip from '../Common/InfoTip';
import ExportMenu from '../Common/ExportMenu';
import ReportPrintHeader from '../Common/ReportPrintHeader';
import { downloadCSV } from '../../utils/csv';
import { downloadElementPDF } from '../../utils/pdf';

const SEC_LABEL = { operating: '営業', investing: '投資', financing: '財務' };

const SECTIONS = [
  { key: 'operating', title: 'I. 営業活動によるキャッシュフロー' },
  { key: 'investing', title: 'II. 投資活動によるキャッシュフロー' },
  { key: 'financing', title: 'III. 財務活動によるキャッシュフロー' },
];

export default function CFPage() {
  const { journals, accounts, loading } = useData();
  const [period, setPeriod] = useState('month');
  const [custom, setCustom] = useState({ start: '', end: '' });

  const { start, end } = useMemo(() => getPeriodRange(period, custom), [period, custom]);

  const cf = useMemo(
    () => computeCashFlow(filterByPeriod(journals, start, end), accounts),
    [journals, accounts, start, end]
  );

  const acctName = (id) => accounts.find((a) => a.id === id)?.name || '(不明)';
  const reportRef = useRef(null);

  const exportCSV = () => {
    const rows = [['区分', '項目', '金額']];
    SECTIONS.forEach((sec) => {
      cf.items[sec.key].forEach((it) => rows.push([SEC_LABEL[sec.key], acctName(it.accountId), Math.round(it.amount)]));
      rows.push([SEC_LABEL[sec.key], `${SEC_LABEL[sec.key]}活動 小計`, Math.round(cf[sec.key])]);
    });
    rows.push(['', '現金及び現金同等物の増減額', Math.round(cf.net)]);
    downloadCSV(`kurofukubo_キャッシュフロー_${start}_${end}.csv`, rows);
  };
  const exportPDF = () => downloadElementPDF(reportRef.current, `kurofukubo_キャッシュフロー_${start}_${end}.pdf`);

  if (loading) return <p className="nd">読み込み中...</p>;

  return (
    <div>
      <div className="pg-header pg-header-row">
        <div>
          <div className="pg-title">キャッシュフロー計算書<InfoTip text="一定期間に現金・預金が実際にいくら増減したかを、営業・投資・財務の活動別に示したもの。手元の「お金の流れ」がわかります。" /></div>
          <div className="pg-sub">お金の出入りを活動別に表示します</div>
        </div>
        <ExportMenu onCSV={exportCSV} onPDF={exportPDF} />
      </div>
      <PeriodBar value={period} onChange={setPeriod} custom={custom} onCustomChange={setCustom} />

      <div ref={reportRef}>
      <ReportPrintHeader title="キャッシュフロー計算書" start={start} end={end} />
      <div className="card" style={{ maxWidth: 560 }}>
        {SECTIONS.map((sec) => (
          <div key={sec.key} style={{ marginBottom: 14 }}>
            <div className="rpt-sec">{sec.title}</div>
            {cf.items[sec.key].length === 0 ? (
              <div className="rr ind" style={{ color: 'var(--tx3)' }}><span>該当なし</span><span className="ra">{fa(0)}</span></div>
            ) : (
              cf.items[sec.key].map((it) => (
                <div key={it.accountId} className="rr ind">
                  <span>{acctName(it.accountId)}</span>
                  <span className="ra" style={{ color: it.amount >= 0 ? 'var(--grn)' : 'var(--red)' }}>{fas(it.amount)}</span>
                </div>
              ))
            )}
            <div className="rr gt" style={{ color: 'var(--ac)' }}>
              <span>小計</span>
              <span className="ra" style={{ color: cf[sec.key] >= 0 ? 'var(--grn)' : 'var(--red)' }}>{fas(cf[sec.key])}</span>
            </div>
          </div>
        ))}

        <div className="rr gt" style={{ borderTop: '2px solid var(--ac)', paddingTop: 8 }}>
          <span>現金及び現金同等物の増減額</span>
          <span className="ra" style={{ color: cf.net >= 0 ? 'var(--grn)' : 'var(--red)' }}>{fas(cf.net)}</span>
        </div>
      </div>

      <div className="info-b" style={{ maxWidth: 560, marginTop: 12 }}>
        簡易直接法: 現金・預金科目の増減を、同一仕訳の相手科目区分（費用/収益→営業、固定資産/有価証券→投資、借入金/純資産→財務）で3分類しています。
      </div>
      </div>
    </div>
  );
}
