import { useState, useMemo } from 'react';
import { useData } from '../../contexts/DataContext';
import { fa, esc } from '../../utils/format';
import { generateRecurring, effectiveNextDate } from '../../utils/autoGen';
import { useToast } from '../Common/Toast';
import EmptyState from '../Common/EmptyState';
import RecurringModal from './RecurringModal';

const FREQ_LABELS = { monthly: '毎月', weekly: '毎週', yearly: '毎年' };

export default function RecurringPage() {
  const { accounts, journals, recurring, addJournal, saveRecurring, loading } = useData();
  const toast = useToast();
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState(null);

  const acctName = (id) => accounts.find((a) => a.id === id)?.name || '(不明)';
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...recurring].sort((a, b) => {
      if (sortKey === 'name') return dir * a.name.localeCompare(b.name, 'ja');
      if (sortKey === 'nextDate') return dir * (effectiveNextDate(a, journals) || '').localeCompare(effectiveNextDate(b, journals) || '');
      return 0;
    });
  }, [recurring, journals, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'nextDate' ? 'desc' : 'asc'); }
  };

  const SortTh = ({ k, children }) => (
    <th className={sortKey === k ? `sortable ${sortDir}` : 'sortable'} onClick={() => toggleSort(k)}>
      {children}<span className="sa" />
    </th>
  );

  const generateOne = async (id) => {
    const r = recurring.find((x) => x.id === id);
    if (!r) return;
    try {
      // preGenerate=true: 期日前でも次回の予定分を先取り生成できる（事前生成）
      const n = await generateRecurring({ recurring, journals, addJournal, saveRecurring, preGenerate: true, onlyId: id });
      toast(n ? `「${r.name}」を${n}件記帳しました` : '記帳対象はありません');
    } catch { toast('生成に失敗しました'); }
  };

  const generateAll = async () => {
    try {
      const n = await generateRecurring({ recurring, journals, addJournal, saveRecurring });
      toast(n ? `${n}件の定期取引を記帳しました` : '生成対象はありません');
    } catch { toast('生成に失敗しました'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('削除しますか？')) return;
    await saveRecurring(recurring.filter((r) => r.id !== id));
    toast('削除しました');
  };

  if (loading) return <p className="nd">読み込み中...</p>;

  return (
    <div>
      <div className="pg-header pg-header-row">
        <div>
          <div className="pg-title">定期取引</div>
          <div className="pg-sub">毎月・毎週の取引を自動生成</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-p" onClick={() => { setEditId(null); setModalOpen(true); }}>＋ 定期取引</button>
          <button className="btn btn-g" onClick={generateAll}>未生成分を一括生成</button>
        </div>
      </div>

      <div className="card">
        {sorted.length === 0 ? (
          <EmptyState
            icon="🔁"
            title="定期取引はまだありません"
            desc="家賃・給与・サブスクなど毎月繰り返す取引を登録すると、「未生成分を一括生成」で期日が来た分をまとめて記帳できます。"
            action={<button className="btn btn-p" onClick={() => { setEditId(null); setModalOpen(true); }}>＋ 定期取引を登録</button>}
          />
        ) : (
          <div className="tw">
            <table>
              <thead><tr>
                <SortTh k="name">名前</SortTh>
                <th>頻度</th>
                <th>実行日</th>
                <th>仕訳内容</th>
                <SortTh k="nextDate">次回生成日</SortTh>
                <th />
              </tr></thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>{FREQ_LABELS[r.frequency] || r.frequency}</td>
                    <td>{r.day}日</td>
                    <td style={{ fontSize: 11 }}>
                      {(r.lines || []).map((l, i) => (
                        <span key={i}>
                          {i > 0 && ' / '}
                          {l.side === 'dr' ? '借' : '貸'}:{acctName(l.accountId)} {fa(l.amount)}
                        </span>
                      ))}
                    </td>
                    <td className="mono text-m">{effectiveNextDate(r, journals) || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn btn-g btn-s" onClick={() => { setEditId(r.id); setModalOpen(true); }}>編集</button>
                      <button className="btn btn-g btn-s" style={{ marginLeft: 4 }} title="期日前でも次回の予定分を先取り生成できます" onClick={() => generateOne(r.id)}>生成</button>
                      <button className="btn btn-d btn-s" style={{ marginLeft: 4 }} onClick={() => handleDelete(r.id)}>削除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <RecurringModal open={modalOpen} onClose={() => setModalOpen(false)} editId={editId} />
    </div>
  );
}
