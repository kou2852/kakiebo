import { useState, useMemo, useEffect } from 'react';
import { useData } from '../../contexts/DataContext';
import { useUI } from '../../contexts/UIContext';
import { fa, esc, ACCOUNT_TYPES, BADGE_CLASSES } from '../../utils/format';
import { filterByPeriod, getPeriodRange } from '../../utils/bookkeeping';
import PeriodBar from '../Dashboard/PeriodBar';
import JournalModal from './JournalModal';
import CSVModal from './CSVModal';
import QuickEntry from './QuickEntry';
import CheatSheetModal from './CheatSheetModal';
import EmptyState from '../Common/EmptyState';
import Modal from '../Common/Modal';
import { useToast } from '../Common/Toast';

export default function JournalPage() {
  const { journals, accounts, wallets, presets, tags, deleteJournal, updateJournal, addJournal, loading } = useData();
  const { journalEntryRequested, consumeJournalEntryRequest } = useUI();
  const toast = useToast();
  const [period, setPeriod] = useState('month');
  const [custom, setCustom] = useState({ start: '', end: '' });
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('date');
  const [sortDir, setSortDir] = useState('desc');
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [presetData, setPresetData] = useState(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkDate, setBulkDate] = useState('');
  const [bulkDesc, setBulkDesc] = useState('');
  const [bulkDr, setBulkDr] = useState('');
  const [bulkCr, setBulkCr] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [tagFilter, setTagFilter] = useState('');
  const [cheatOpen, setCheatOpen] = useState(false);

  const sortedAccounts = useMemo(() => [...accounts].sort((a, b) => (a.code || '').localeCompare(b.code || '')), [accounts]);

  const walletName = (id) => wallets.find((w) => w.id === id)?.name || '';
  const openNew = () => { setEditId(null); setPresetData(null); setModalOpen(true); };
  const applyPreset = (p) => { setEditId(null); setPresetData(p); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setPresetData(null); };

  useEffect(() => {
    if (!journalEntryRequested) return;
    openNew();
    consumeJournalEntryRequest();
  }, [journalEntryRequested, consumeJournalEntryRequest]);

  const { start, end } = useMemo(() => getPeriodRange(period, custom), [period, custom]);

  const filtered = useMemo(() => {
    const nm = (id) => accounts.find((x) => x.id === id)?.name || '';
    const sideNames = (j, side) => j.lines.filter((l) => l.side === side).map((l) => nm(l.accountId)).join('/');
    let j = filterByPeriod(journals, start, end);
    if (search) {
      const q = search.toLowerCase();
      j = j.filter((x) =>
        (x.desc || '').toLowerCase().includes(q) ||
        x.lines.some((l) => {
          const a = accounts.find((a) => a.id === l.accountId);
          return a && a.name.toLowerCase().includes(q);
        })
      );
    }
    if (tagFilter) j = j.filter((x) => x.lines.some((l) => (l.splits || []).some((s) => s.tagId === tagFilter)));
    // ソート
    const dir = sortDir === 'asc' ? 1 : -1;
    j = [...j].sort((a, b) => {
      if (sortKey === 'date') return dir * a.date.localeCompare(b.date);
      if (sortKey === 'drName') return dir * sideNames(a, 'dr').localeCompare(sideNames(b, 'dr'), 'ja');
      if (sortKey === 'crName') return dir * sideNames(a, 'cr').localeCompare(sideNames(b, 'cr'), 'ja');
      if (sortKey === 'amount') {
        const aa = a.lines.filter((l) => l.side === 'dr').reduce((s, l) => s + l.amount, 0);
        const ba = b.lines.filter((l) => l.side === 'dr').reduce((s, l) => s + l.amount, 0);
        return dir * (aa - ba);
      }
      if (sortKey === 'crAmount') {
        const aa = a.lines.filter((l) => l.side === 'cr').reduce((s, l) => s + l.amount, 0);
        const ba = b.lines.filter((l) => l.side === 'cr').reduce((s, l) => s + l.amount, 0);
        return dir * (aa - ba);
      }
      if (sortKey === 'desc') return dir * (a.desc || '').localeCompare(b.desc || '', 'ja');
      return 0;
    });
    return j;
  }, [journals, accounts, start, end, search, tagFilter, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'date' ? 'desc' : 'asc');
    }
  };

  const acctName = (id) => {
    const a = accounts.find((x) => x.id === id);
    return a ? a.name : '(不明)';
  };
  const tagById = (id) => tags.find((t) => t.id === id);

  const handleDelete = async (id) => {
    if (!confirm('削除しますか？')) return;
    try {
      await deleteJournal(id);
      toast('削除しました');
    } catch (err) {
      toast('削除に失敗しました');
    }
  };

  // 一括選択
  const toggleSel = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allSelected = filtered.length > 0 && filtered.every((j) => selected.has(j.id));
  const toggleAll = () => setSelected((s) => {
    const n = new Set(s);
    if (filtered.length > 0 && filtered.every((j) => n.has(j.id))) filtered.forEach((j) => n.delete(j.id));
    else filtered.forEach((j) => n.add(j.id));
    return n;
  });
  const clearSel = () => setSelected(new Set());

  const handleBulkDelete = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    if (!confirm(`選択した${ids.length}件を削除しますか？`)) return;
    try {
      for (const id of ids) await deleteJournal(id);
      toast(`${ids.length}件を削除しました`);
      clearSel();
    } catch { toast('一括削除に失敗しました'); }
  };

  const handleBulkEdit = async () => {
    if (bulkDate && !/^\d{4}-\d{2}-\d{2}$/.test(bulkDate)) { toast('日付は YYYY-MM-DD 形式で入力してください'); return; }
    if (!bulkDate && bulkDesc === '' && !bulkDr && !bulkCr) { toast('変更する項目を1つ以上指定してください'); return; }
    const ids = [...selected];
    try {
      for (const id of ids) {
        const j = journals.find((x) => x.id === id);
        if (!j) continue;
        const lines = (bulkDr || bulkCr)
          ? j.lines.map((l) => ({
              ...l,
              accountId: (l.side === 'dr' && bulkDr) ? bulkDr : (l.side === 'cr' && bulkCr) ? bulkCr : l.accountId,
            }))
          : j.lines;
        await updateJournal(id, {
          date: bulkDate || j.date,
          desc: bulkDesc !== '' ? bulkDesc : (j.desc || ''),
          lines,
        });
      }
      toast(`${ids.length}件を更新しました`);
      setBulkOpen(false); clearSel();
    } catch { toast('一括編集に失敗しました'); }
  };

  const SortTh = ({ k, children }) => {
    const cls = sortKey === k ? `sortable ${sortDir}` : 'sortable';
    return (
      <th className={cls} onClick={() => toggleSort(k)}>
        {children}<span className="sa" />
      </th>
    );
  };

  if (loading) return <p className="nd">読み込み中...</p>;

  return (
    <div>
      <div className="pg-header pg-header-row">
        <div>
          <div className="pg-title">仕訳入力</div>
          <div className="pg-sub">借方・貸方を入力して取引を記帳します</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-g btn-s" style={{ opacity: 0.5, cursor: 'default', alignSelf: 'center' }}
            onClick={() => toast('AI仕分けは準備中です（近日公開予定）')}>
            🤖 AI仕分け（準備中）
          </button>
          <button className="btn btn-g" onClick={() => setCheatOpen(true)}>📖 チートシート</button>
          <button className="btn btn-g" data-tour="csv-btn" onClick={() => setCsvOpen(true)}>CSV取込</button>
          <button className="btn btn-p" onClick={openNew}>＋ 新規仕訳</button>
        </div>
      </div>

      <QuickEntry />

      {presets.length > 0 && (
        <div className="card" data-tour="presets" style={{ marginBottom: 14, padding: '10px 14px' }}>
          <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 6 }}>プリセットから記帳（タップで入力欄に反映）</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {presets.map((p) => (
              <button key={p.id} className="btn btn-g btn-s" onClick={() => applyPreset(p)} title={walletName(p.walletId)}>
                <span style={{ color: p.type === 'in' ? 'var(--grn)' : 'var(--red)', marginRight: 4 }}>{p.type === 'in' ? '入' : '出'}</span>
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <PeriodBar value={period} onChange={setPeriod} custom={custom} onCustomChange={setCustom} />

      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text" className="fc" placeholder="🔍 摘要・科目で検索"
          value={search} onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 240, padding: '6px 10px', fontSize: 12 }}
        />
        {journals.length > 0 && (
          <button className={`btn btn-s ${selectMode ? 'btn-p' : 'btn-g'}`}
            onClick={() => { if (selectMode) clearSel(); setSelectMode((v) => !v); }}>
            {selectMode ? '✕ 一括選択を終了' : '☑ 一括選択'}
          </button>
        )}
        {tags.length > 0 && (
          <select className="fc" value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}
            style={{ maxWidth: 160, padding: '6px 10px', fontSize: 12 }}>
            <option value="">🏷 全タグ</option>
            {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
      </div>

      {selectMode && selected.size > 0 && (
        <div className="card" style={{ marginBottom: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600 }}>{selected.size}件 選択中</span>
          <button className="btn btn-g btn-s" onClick={() => { setBulkDate(''); setBulkDesc(''); setBulkDr(''); setBulkCr(''); setBulkOpen(true); }}>一括編集</button>
          <button className="btn btn-d btn-s" onClick={handleBulkDelete}>一括削除</button>
          <button className="btn btn-g btn-s" onClick={clearSel}>選択解除</button>
        </div>
      )}

      <div className="card">
        {filtered.length === 0 ? (
          journals.length === 0 ? (
            <EmptyState
              icon="✏️"
              title="まだ取引がありません"
              desc="上の「クイック入力」に「食費 1200 現金」のように入力するか、「＋ 新規仕訳」から記帳を始めましょう。"
              media="/howto-2-entry.gif"
              action={<button className="btn btn-p" onClick={openNew}>＋ 最初の仕訳を記帳</button>}
            />
          ) : (
            <div className="nd" style={{ textAlign: 'center', padding: '24px 0' }}>
              この期間の仕訳はありません。期間を変更するか、新しい取引を記帳してください。
            </div>
          )
        ) : (
          <div className="tw tbl-cards">
            <table>
              <thead>
                <tr>
                  {selectMode && (
                    <th style={{ width: 28 }}>
                      <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="全選択" />
                    </th>
                  )}
                  <SortTh k="date">日付</SortTh>
                  <SortTh k="desc">摘要</SortTh>
                  <SortTh k="drName">借方</SortTh>
                  <SortTh k="crName">貸方</SortTh>
                  <SortTh k="amount">借方金額</SortTh>
                  <SortTh k="crAmount">貸方金額</SortTh>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((j) => {
                  const dr = j.lines.filter((l) => l.side === 'dr');
                  const cr = j.lines.filter((l) => l.side === 'cr');
                  const jtags = [...new Set(j.lines.flatMap((l) => (l.splits || []).map((s) => s.tagId)))].filter(Boolean);
                  return (
                    <tr key={j.id}
                      onClick={selectMode ? () => toggleSel(j.id) : undefined}
                      style={{ ...(selectMode ? { cursor: 'pointer' } : {}), ...(selected.has(j.id) ? { background: 'var(--acb)' } : {}) }}>
                      {selectMode && (
                        <td data-label="選択" style={{ textAlign: 'center' }}>
                          <input type="checkbox" checked={selected.has(j.id)} readOnly aria-label="選択" />
                        </td>
                      )}
                      <td data-label="日付" className="mono text-m" style={{ whiteSpace: 'nowrap' }}>{j.date}</td>
                      <td data-label="摘要">
                        {j.desc || ''}
                        {jtags.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 2 }}>
                            {jtags.map((tid) => { const t = tagById(tid); return t ? <span key={tid} className="tag-chip" style={{ background: t.color || '#888', fontSize: 9 }}>{t.name}</span> : null; })}
                          </div>
                        )}
                      </td>
                      <td data-label="借方">{dr.map((l) => acctName(l.accountId)).join(' / ')}</td>
                      <td data-label="貸方">{cr.map((l) => acctName(l.accountId)).join(' / ')}</td>
                      <td data-label="借方金額" className="text-r mono dr-c">{fa(dr.reduce((s, l) => s + l.amount, 0))}</td>
                      <td data-label="貸方金額" className="text-r mono cr-c">{fa(cr.reduce((s, l) => s + l.amount, 0))}</td>
                      <td className="td-actions" style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn btn-g btn-s" onClick={(e) => { e.stopPropagation(); setEditId(j.id); setPresetData(null); setModalOpen(true); }}>編集</button>
                        <button className="btn btn-d btn-s" onClick={(e) => { e.stopPropagation(); handleDelete(j.id); }}>削除</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <JournalModal open={modalOpen} onClose={closeModal} editId={editId} preset={presetData} />
      <CSVModal open={csvOpen} onClose={() => setCsvOpen(false)} />
      <CheatSheetModal open={cheatOpen} onClose={() => setCheatOpen(false)} />

      <Modal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title={`一括編集（${selected.size}件）`}
        footer={
          <>
            <button className="btn btn-g" onClick={() => setBulkOpen(false)}>キャンセル</button>
            <button className="btn btn-p" onClick={handleBulkEdit}>適用</button>
          </>
        }
      >
        <p style={{ fontSize: 12, color: 'var(--tx3)', marginBottom: 12 }}>
          指定した項目だけを、選択中の{selected.size}件へまとめて適用します（空欄・「変更しない」は据え置き）。金額は変更しません。
        </p>
        <div className="form-row" style={{ marginBottom: 10 }}>
          <div className="fg">
            <label className="fl">日付（変更する場合のみ）</label>
            <input type="date" className="fc" value={bulkDate} onChange={(e) => setBulkDate(e.target.value)} />
          </div>
          <div className="fg">
            <label className="fl">摘要（変更する場合のみ）</label>
            <input type="text" className="fc" maxLength={100} placeholder="（入力すると上書き）" value={bulkDesc} onChange={(e) => setBulkDesc(e.target.value)} />
          </div>
        </div>
        <div className="form-row">
          <div className="fg">
            <label className="fl">借方科目（変更する場合のみ）</label>
            <select className="fc" value={bulkDr} onChange={(e) => setBulkDr(e.target.value)}>
              <option value="">変更しない</option>
              {sortedAccounts.map((a) => <option key={a.id} value={a.id}>{a.code ? `${a.code} ` : ''}{a.name}</option>)}
            </select>
          </div>
          <div className="fg">
            <label className="fl">貸方科目（変更する場合のみ）</label>
            <select className="fc" value={bulkCr} onChange={(e) => setBulkCr(e.target.value)}>
              <option value="">変更しない</option>
              {sortedAccounts.map((a) => <option key={a.id} value={a.id}>{a.code ? `${a.code} ` : ''}{a.name}</option>)}
            </select>
          </div>
        </div>
      </Modal>
    </div>
  );
}
