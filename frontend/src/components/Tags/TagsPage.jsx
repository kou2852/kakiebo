import { useState, useMemo } from 'react';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';
import { fa, esc } from '../../utils/format';
import { calcBalances, accountBalance, computeTagBalances } from '../../utils/bookkeeping';
import { useToast } from '../Common/Toast';
import { GUEST_LIMITS } from '../../config/tiers';
import EmptyState from '../Common/EmptyState';
import TagModal from './TagModal';

export default function TagsPage() {
  const { accounts, journals, tags, allocs, wallets, saveTags, loading } = useData();
  const { guestMode } = useAuth();
  const toast = useToast();

  const openNewTag = () => {
    if (guestMode && tags.length >= GUEST_LIMITS.tags) {
      toast(`ゲストはタグを${GUEST_LIMITS.tags}件まで登録できます。アカウント登録で解除されます`);
      return;
    }
    setTagEditId(null); setTagModalOpen(true);
  };
  const openEditTag = (id) => { setTagEditId(id); setTagModalOpen(true); };
  const deleteTag = async (t) => {
    if (!confirm(`タグ「${t.name}」を削除しますか？`)) return;
    try {
      await saveTags(tags.filter((x) => x.id !== t.id));
      toast('削除しました');
    } catch { toast('削除に失敗しました'); }
  };
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [tagEditId, setTagEditId] = useState(null);

  const bB = useMemo(() => calcBalances(journals, accounts), [journals, accounts]);
  const tagBals = useMemo(() => computeTagBalances(journals, accounts), [journals, accounts]);

  // タグごとの合計残高
  const tagTotals = useMemo(() => {
    const tt = {};
    tags.forEach((t) => { tt[t.id] = 0; });
    allocs.forEach((a) => { if (tt[a.tagId] !== undefined) tt[a.tagId] += a.amount; });
    Object.values(tagBals).forEach((m) => Object.entries(m).forEach(([tid, amt]) => {
      if (tt[tid] !== undefined) tt[tid] += amt;
    }));
    return tt;
  }, [tags, allocs, tagBals]);

  const sortedTags = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...tags].sort((a, b) => {
      if (sortKey === 'name') return dir * a.name.localeCompare(b.name, 'ja');
      if (sortKey === 'bal') return dir * ((tagTotals[a.id] || 0) - (tagTotals[b.id] || 0));
      return 0;
    });
  }, [tags, sortKey, sortDir, tagTotals]);

  // 科目ごとのタグ配分
  const acctTagData = useMemo(() => {
    const assetAccts = accounts.filter((a) => a.type === 'asset').sort((a, b) => accountBalance(b.id, accounts, bB) - accountBalance(a.id, accounts, bB));
    return assetAccts.map((a) => {
      const bal = Math.max(0, accountBalance(a.id, accounts, bB));
      const manual = allocs.filter((x) => x.accountId === a.id);
      const computed = tagBals[a.id] || {};
      const mg = {};
      manual.forEach((x) => { mg[x.tagId] = (mg[x.tagId] || 0) + x.amount; });
      Object.entries(computed).forEach(([tid, amt]) => { mg[tid] = (mg[tid] || 0) + amt; });
      const items = Object.entries(mg).filter(([, v]) => v > 0).map(([tid, amt]) => {
        const t = tags.find((x) => x.id === tid);
        return { tagId: tid, name: t?.name || '?', color: t?.color || '#666', amount: amt };
      });
      const allocated = items.reduce((s, x) => s + x.amount, 0);
      const free = bal - allocated;
      const w = wallets.find((x) => x.accountId === a.id);
      return { account: a, bal, items, free, defaultTag: w?.defaultTagName || '(未配分)', defaultColor: w?.defaultTagColor || '#888' };
    }).filter((x) => x.bal > 0);
  }, [accounts, journals, tags, allocs, tagBals, wallets, bB]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'bal' ? 'desc' : 'asc'); }
  };

  const SortTh = ({ k, children }) => (
    <th className={sortKey === k ? `sortable ${sortDir}` : 'sortable'} onClick={() => toggleSort(k)}>
      {children}<span className="sa" />
    </th>
  );

  if (loading) return <p className="nd">読み込み中...</p>;

  return (
    <div>
      <div className="pg-header pg-header-row">
        <div>
          <div className="pg-title">タグ・配分</div>
          <div className="pg-sub">タグ別の集計と残高配分を管理します</div>
        </div>
        <button className="btn btn-p" onClick={openNewTag}>＋ タグ</button>
      </div>

      <div className="g2">
        {/* 登録タグ */}
        <div>
          <div className="card-title" style={{ marginTop: 8 }}>登録タグ</div>
          {sortedTags.length === 0 ? (
            <EmptyState
              icon="🏷️"
              title="タグはまだありません"
              desc="タグを作ると、口座残高を「生活費」「貯蓄」などで色分けして把握できます（任意の機能です）。"
              action={<button className="btn btn-p" onClick={openNewTag}>＋ タグを作る</button>}
            />
          ) : (
            <div className="tw">
              <table>
                <thead><tr>
                  <SortTh k="name">タグ</SortTh>
                  <th>備考</th>
                  <SortTh k="bal">残高</SortTh>
                  <th />
                </tr></thead>
                <tbody>
                  {sortedTags.map((t) => (
                    <tr key={t.id}>
                      <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 600 }}><span style={{ width: 11, height: 11, borderRadius: '50%', background: t.color, flex: 'none' }} />{t.name}</span></td>
                      <td className="text-m">{t.note || ''}</td>
                      <td className="text-r mono">{fa(Math.max(0, tagTotals[t.id] || 0))}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn btn-g btn-s" onClick={() => openEditTag(t.id)}>編集</button>
                        <button className="btn btn-d btn-s" style={{ marginLeft: 4 }} onClick={() => deleteTag(t)}>削除</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 口座別 配分 */}
        <div>
          <div className="card-title" style={{ marginTop: 8 }}>口座別 配分</div>
          {acctTagData.length === 0 ? <p className="nd">資産科目なし</p> : (
            acctTagData.map((d) => (
              <div key={d.account.id} className="ta-card">
                <div className="ta-card-h">
                  <span className="ta-card-name">{d.account.name}</span>
                  <span className="ta-card-bal">{fa(d.bal)}</span>
                </div>
                {d.items.map((item, i) => {
                  const pct = d.bal > 0 ? (item.amount / d.bal * 100).toFixed(1) : 0;
                  return (
                    <div key={i} className="ta-row">
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 80, fontSize: 12 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: item.color }} />
                        {item.name}
                      </span>
                      <div className="ta-bar-w"><div className="ta-bar" style={{ background: item.color, width: `${pct}%` }} /></div>
                      <span className="ta-amt">{fa(item.amount)}</span>
                    </div>
                  );
                })}
                {d.free > 0 && (
                  <div className="ta-free" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: d.defaultColor }} />
                    {d.defaultTag}: <span className="mono">{fa(d.free)}</span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
      <TagModal open={tagModalOpen} onClose={() => setTagModalOpen(false)} editId={tagEditId} />
    </div>
  );
}