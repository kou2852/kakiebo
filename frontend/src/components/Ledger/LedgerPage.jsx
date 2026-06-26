import { useState, useMemo, useRef } from 'react';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';
import { fa, esc, ACCOUNT_TYPES, BADGE_CLASSES } from '../../utils/format';
import { filterByPeriod, getPeriodRange, calcBalances, accountBalance } from '../../utils/bookkeeping';
import PeriodBar from '../Dashboard/PeriodBar';
import JournalModal from '../Journal/JournalModal';
import Ad from '../Common/Ad';
import ExportMenu from '../Common/ExportMenu';
import ReportPrintHeader from '../Common/ReportPrintHeader';
import { downloadCSV } from '../../utils/csv';
import { downloadElementPDF } from '../../utils/pdf';
import { AD_CONFIG } from '../../config/tiers';

export default function LedgerPage() {
  const { journals, accounts, tags, loading } = useData();
  const { tier } = useAuth();
  const [period, setPeriod] = useState('month');
  const [custom, setCustom] = useState({ start: '', end: '' });
  const [search, setSearch] = useState('');
  const [filterIn, setFilterIn] = useState(true);
  const [filterOut, setFilterOut] = useState(true);
  const [tagFilter, setTagFilter] = useState('');
  const [acctFilter, setAcctFilter] = useState('');
  const sortedAccounts = useMemo(() => [...accounts].sort((a, b) => (a.code || '').localeCompare(b.code || '')), [accounts]);
  const [sortKey, setSortKey] = useState('date');
  const [sortDir, setSortDir] = useState('desc');

  const { start, end } = useMemo(() => getPeriodRange(period, custom), [period, custom]);

  const filtered = useMemo(() => {
    let j = filterByPeriod(journals, start, end);

    // 入金/出金フィルタ
    if (!(filterIn && filterOut)) {
      j = j.filter((x) => {
        const hasI = x.lines.some((l) => { const a = accounts.find((a) => a.id === l.accountId); return a && a.type === 'income'; });
        const hasE = x.lines.some((l) => { const a = accounts.find((a) => a.id === l.accountId); return a && a.type === 'expense'; });
        if (hasI && !hasE) return filterIn;
        if (hasE && !hasI) return filterOut;
        return filterIn || filterOut;
      });
    }

    // 検索
    if (search) {
      const q = search.toLowerCase();
      j = j.filter((x) => (x.desc || '').toLowerCase().includes(q) || x.lines.some((l) => {
        const a = accounts.find((a) => a.id === l.accountId);
        return a && a.name.toLowerCase().includes(q);
      }));
    }

    if (tagFilter) j = j.filter((x) => x.lines.some((l) => (l.splits || []).some((s) => s.tagId === tagFilter)));
    if (acctFilter) j = j.filter((x) => x.lines.some((l) => l.accountId === acctFilter));

    // ソート
    const dir = sortDir === 'asc' ? 1 : -1;
    j = [...j].sort((a, b) => {
      if (sortKey === 'date') return dir * a.date.localeCompare(b.date);
      if (sortKey === 'desc') return dir * (a.desc || '').localeCompare(b.desc || '', 'ja');
      if (sortKey === 'amount') {
        const aa = a.lines.filter((l) => l.side === 'dr').reduce((s, l) => s + l.amount, 0);
        const ba = b.lines.filter((l) => l.side === 'dr').reduce((s, l) => s + l.amount, 0);
        return dir * (aa - ba);
      }
      if (sortKey === 'drAcct' || sortKey === 'crAcct') {
        const side = sortKey === 'drAcct' ? 'dr' : 'cr';
        const an1 = a.lines.find((l) => l.side === side);
        const an2 = b.lines.find((l) => l.side === side);
        const n1 = an1 ? (accounts.find((x) => x.id === an1.accountId)?.name || '') : '';
        const n2 = an2 ? (accounts.find((x) => x.id === an2.accountId)?.name || '') : '';
        return dir * n1.localeCompare(n2, 'ja');
      }
      return 0;
    });
    return j;
  }, [journals, accounts, start, end, search, filterIn, filterOut, tagFilter, acctFilter, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'date' ? 'desc' : 'asc'); }
  };

  const acctName = (id) => accounts.find((a) => a.id === id)?.name || '(不明)';
  const tagById = (id) => tags.find((t) => t.id === id);

  const SortTh = ({ k, children }) => (
    <th className={sortKey === k ? `sortable ${sortDir}` : 'sortable'} onClick={() => toggleSort(k)}>
      {children}<span className="sa" />
    </th>
  );

  const [editId, setEditId] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  const reportRef = useRef(null);
  const exportCSV = () => {
    const rows = [['日付', '摘要', '借方', '貸方', '金額']];
    filtered.forEach((j) => {
      const dr = j.lines.filter((l) => l.side === 'dr');
      const cr = j.lines.filter((l) => l.side === 'cr');
      const amt = dr.reduce((s, l) => s + l.amount, 0);
      rows.push([
        j.date, j.desc || '',
        dr.map((l) => `${acctName(l.accountId)} ${Math.round(l.amount)}`).join(' / '),
        cr.map((l) => `${acctName(l.accountId)} ${Math.round(l.amount)}`).join(' / '),
        Math.round(amt),
      ]);
    });
    downloadCSV(`kurofukubo_仕訳帳_${start}_${end}.csv`, rows);
  };
  const exportPDF = () => downloadElementPDF(reportRef.current, `kurofukubo_仕訳帳_${start}_${end}.pdf`);

  if (loading) return <p className="nd">読み込み中...</p>;

  return (
    <div>
      <div className="pg-header pg-header-row">
        <div>
          <div className="pg-title">仕訳帳</div>
          <div className="pg-sub">すべての取引履歴を確認します</div>
        </div>
        <ExportMenu onCSV={exportCSV} onPDF={exportPDF} />
      </div>
      <PeriodBar value={period} onChange={setPeriod} custom={custom} onCustomChange={setCustom} />
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="text" className="fc" placeholder="🔍 摘要・科目で検索" value={search} onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 240, padding: '6px 10px', fontSize: 12 }} />
        <div className="filter-bar">
          <span style={{ fontSize: 11, color: 'var(--tx3)', marginRight: 2 }}>表示:</span>
          <span className={`fbtn ${filterIn ? 'on' : 'off'}`} onClick={() => setFilterIn(!filterIn)}>入金</span>
          <span className={`fbtn ${filterOut ? 'on' : 'off'}`} onClick={() => setFilterOut(!filterOut)}>出金</span>
        </div>
        {tags.length > 0 && (
          <select className="fc" value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}
            style={{ maxWidth: 160, padding: '6px 10px', fontSize: 12 }}>
            <option value="">🏷 全タグ</option>
            {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        <select className="fc" value={acctFilter} onChange={(e) => setAcctFilter(e.target.value)}
          style={{ maxWidth: 180, padding: '6px 10px', fontSize: 12 }}>
          <option value="">📒 全科目</option>
          {sortedAccounts.map((a) => <option key={a.id} value={a.id}>{a.code ? `${a.code} ` : ''}{a.name}</option>)}
        </select>
      </div>
      <div ref={reportRef}>
      <ReportPrintHeader title="仕訳帳" start={start} end={end} />
      <div className="card">
        {filtered.length === 0 ? <p className="nd" style={{ textAlign: 'center', padding: '24px 0' }}>なし</p> : (
          <div className="tw tbl-cards">
            <table>
              <thead><tr>
                <SortTh k="date">日付</SortTh>
                <SortTh k="desc">摘要</SortTh>
                <SortTh k="drAcct">借方</SortTh>
                <SortTh k="crAcct">貸方</SortTh>
                <SortTh k="amount">金額</SortTh>
                <th />
              </tr></thead>
              <tbody>
                {filtered.map((j) => {
                  const dr = j.lines.filter((l) => l.side === 'dr');
                  const cr = j.lines.filter((l) => l.side === 'cr');
                  const amt = dr.reduce((s, l) => s + l.amount, 0);
                  const jtags = [...new Set(j.lines.flatMap((l) => (l.splits || []).map((s) => s.tagId)))].filter(Boolean);
                  return (
                    <tr key={j.id}>
                      <td data-label="日付" className="mono text-m" style={{ whiteSpace: 'nowrap' }}>{j.date}</td>
                      <td data-label="摘要">
                        {j.desc || ''}
                        {jtags.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 2 }}>
                            {jtags.map((tid) => { const t = tagById(tid); return t ? <span key={tid} className="tag-chip" style={{ background: t.color || '#888', fontSize: 9 }}>{t.name}</span> : null; })}
                          </div>
                        )}
                      </td>
                      <td data-label="借方">{dr.map((l) => `${acctName(l.accountId)} ${fa(l.amount)}`).join(' / ')}</td>
                      <td data-label="貸方">{cr.map((l) => `${acctName(l.accountId)} ${fa(l.amount)}`).join(' / ')}</td>
                      <td data-label="金額" className="text-r mono">{fa(amt)}</td>
                      <td className="td-actions" style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn btn-g btn-s" onClick={() => { setEditId(j.id); setModalOpen(true); }}>編集</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </div>
      {AD_CONFIG[tier]?.ledger && <Ad />}
      <JournalModal open={modalOpen} onClose={() => setModalOpen(false)} editId={editId} />
    </div>
  );
}
