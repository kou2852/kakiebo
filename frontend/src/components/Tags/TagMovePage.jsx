import { useState, useMemo } from 'react';
import { useData } from '../../contexts/DataContext';
import { faBal } from '../../utils/format';
import { computeTagBalances, tagAllocation } from '../../utils/bookkeeping';
import { moveAlloc, tagLeft } from '../../utils/allocMove';
import { useToast } from '../Common/Toast';
import EmptyState from '../Common/EmptyState';

// 全角数字も受ける。数字以外は落とす
const toAmount = (v) => Number(String(v ?? '').normalize('NFKC').replace(/[^0-9]/g, '')) || 0;

/**
 * タグ付け替え。口座の配分を、あるタグから別のタグへ指定の金額だけ動かす。
 * 配分の目安を動かすだけで、残高も仕訳も動かさない（仕訳は増えない）。
 */
export default function TagMovePage() {
  const { accounts, journals, tags, allocs, wallets, saveAllocs, loading } = useData();
  const toast = useToast();
  const [accountId, setAccountId] = useState('');
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const rows = useMemo(() => tagAllocation(journals, accounts, tags, allocs, wallets), [journals, accounts, tags, allocs, wallets]);
  const flows = useMemo(() => computeTagBalances(journals, accounts).byAccount, [journals, accounts]);

  const accId = rows.some((r) => r.account.id === accountId) ? accountId : (rows[0]?.account.id || '');
  const flow = flows[accId] || {};
  const left = (tagId) => tagLeft(allocs, flow, accId, tagId);
  // 配分が無いタグからも付け替えられる（マイナス＝他のタグから内部的に借りている状態）
  const from = tags.some((g) => g.id === fromId) ? fromId : '';
  const toTags = tags.filter((g) => g.id !== from);
  const to = toTags.some((g) => g.id === toId) ? toId : '';

  const n = toAmount(amount);
  const next = from && to && n > 0 ? moveAlloc(allocs, { accountId: accId, fromId: from, toId: to, amount: n }) : null;
  const tagName = (id) => tags.find((g) => g.id === id)?.name || '';

  const handleMove = async () => {
    if (!from || !to) { toast('付け替え元と付け替え先のタグを選んでください'); return; }
    if (n <= 0) { toast('付け替える金額を入力してください'); return; }
    setSaving(true);
    try {
      await saveAllocs(next);
      toast(`${tagName(from)} から ${tagName(to)} へ ${faBal(n)} 付け替えました`);
      setAmount('');
    } catch (e) {
      toast(e?.status === 409 ? '他の端末で配分が更新されています。再読み込みしてからやり直してください' : '保存に失敗しました');
    } finally { setSaving(false); }
  };

  if (loading) return <p className="nd">読み込み中...</p>;

  return (
    <div>
      <div className="pg-header">
        <div className="pg-title">タグ付け替え</div>
        <div className="pg-sub">口座の配分を、あるタグから別のタグへ付け替えます</div>
      </div>

      {tags.length < 2 ? (
        <EmptyState icon="🏷️" title="タグが2つ以上必要です" desc="付け替え元と付け替え先のタグを作ってから使えます。" />
      ) : rows.length === 0 ? (
        <p className="nd">配分できる口座がありません</p>
      ) : (
        <div className="ta-card" style={{ maxWidth: 520 }}>
          <p className="text-m" style={{ fontSize: 12, marginBottom: 12 }}>
            配分の目安を動かすだけです。残高は変わらず、仕訳も増えません。付け替え元は、残りを超えてもかまいません。超えた分はマイナス（他のタグからの借り）になります。
          </p>
          <div style={{ display: 'grid', gap: 12 }}>
            <div className="fg">
              <label className="fl">口座</label>
              <select className="fc" value={accId} onChange={(e) => { setAccountId(e.target.value); setFromId(''); setToId(''); setAmount(''); }}>
                {rows.map((r) => <option key={r.account.id} value={r.account.id}>{r.account.name}（残高 {faBal(r.bal)}）</option>)}
              </select>
            </div>
            <div className="fg">
              <label className="fl">付け替え元のタグ</label>
              <select className="fc" value={from} onChange={(e) => { setFromId(e.target.value); setToId(''); setAmount(''); }}>
                <option value="">選んでください</option>
                {tags.map((g) => <option key={g.id} value={g.id}>{g.name}（残り {faBal(left(g.id))}）</option>)}
              </select>
            </div>
            <div className="fg">
              <label className="fl">付け替え先のタグ</label>
              <select className="fc" value={to} onChange={(e) => setToId(e.target.value)} disabled={!from}>
                <option value="">選んでください</option>
                {toTags.map((g) => <option key={g.id} value={g.id}>{g.name}（残り {faBal(left(g.id))}）</option>)}
              </select>
              {!from ? <div className="text-m" style={{ fontSize: 12, marginTop: 4 }}>上で付け替え元のタグを選ぶと、選べるようになります。</div> : null}
            </div>
            <div className="fg">
              <label className="fl">付け替える金額</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input type="text" inputMode="numeric" className="fc mono text-r" placeholder="0" style={{ flex: 1 }}
                  value={amount} onChange={(e) => setAmount(e.target.value)} disabled={!from} />
                <button type="button" className="btn btn-g" disabled={!from} onClick={() => setAmount(String(Math.max(0, left(from))))}>残り全額</button>
              </div>
              {!from || !to ? <div className="text-m" style={{ fontSize: 12, marginTop: 4 }}>付け替え元と付け替え先のタグを選ぶと、金額を入力でき、付け替え後の配分が表示されます。</div> : null}
            </div>
          </div>

          {next ? (
            <div style={{ marginTop: 14, fontSize: 13 }}>
              <div className="ta-row"><span style={{ flex: 1 }}>{tagName(from)}</span><span className="mono">{faBal(left(from))} → {faBal(left(from) - n)}</span></div>
              <div className="ta-row"><span style={{ flex: 1 }}>{tagName(to)}</span><span className="mono">{faBal(left(to))} → {faBal(left(to) + n)}</span></div>
            </div>
          ) : null}

          <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-p" onClick={handleMove} disabled={saving || !next}>付け替える</button>
          </div>
        </div>
      )}
    </div>
  );
}
