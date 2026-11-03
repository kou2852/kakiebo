import { useState, useEffect, useMemo } from 'react';
import { useData } from '../../contexts/DataContext';
import { useUI } from '../../contexts/UIContext';
import { faBal } from '../../utils/format';
import { computeTagBalances, tagAllocation } from '../../utils/bookkeeping';
import { useToast } from '../Common/Toast';
import Modal from '../Common/Modal';

const key = (accountId, tagId) => `${accountId}#${tagId}`;
// 全角数字も受ける。数字以外は落とす。先頭の - は残す（マイナスの配分＝他のタグからの借り。タグ付け替えで付く）
const toAmount = (v) => {
  const s = String(v ?? '').normalize('NFKC').trim();
  const n = Number(s.replace(/[^0-9]/g, '')) || 0;
  return /^[-−]/.test(s) ? -n : n;
};

/**
 * タグ配分の入力。口座の残高のうち、いくらをどのタグに取っておくかを決める。残高そのものは動かさない。
 * 保存は全置換（allocs は id を持たない）。画面に出ていない口座の配分も draft に持ち、そのまま残す。
 */
export default function AllocModal({ open, onClose }) {
  const { accounts, journals, tags, allocs, wallets, saveAllocs } = useData();
  const toast = useToast();
  const { navigate } = useUI();
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(Object.fromEntries((allocs || []).map((a) => [key(a.accountId, a.tagId), String(a.amount)])));
  }, [open, allocs]);

  // 残高と、記帳でタグを付けた分の増減。配分に記帳分を足したものが「残り」
  const rows = useMemo(() => tagAllocation(journals, accounts, tags, allocs, wallets), [journals, accounts, tags, allocs, wallets]);
  const flows = useMemo(() => computeTagBalances(journals, accounts).byAccount, [journals, accounts]);

  const handleSave = async () => {
    const items = Object.entries(draft)
      .map(([k, v]) => {
        const [accountId, tagId] = k.split('#');
        return { accountId, tagId, amount: toAmount(v) };
      })
      .filter((a) => a.amount !== 0);
    setSaving(true);
    try {
      await saveAllocs(items);
      toast('保存しました');
      onClose();
    } catch (e) {
      toast(e?.status === 409 ? '他の端末で配分が更新されています。再読み込みしてからやり直してください' : '保存に失敗しました');
    } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="タグ配分を編集" wide
      footer={<><button className="btn btn-g" style={{ marginRight: 'auto' }} onClick={() => { onClose(); navigate('tagmove'); }}>タグ間で付け替え</button><button className="btn btn-g" onClick={onClose}>キャンセル</button><button className="btn btn-p" onClick={handleSave} disabled={saving}>保存</button></>}>
      {tags.length === 0 ? (
        <p className="nd">先にタグを作ってください</p>
      ) : rows.length === 0 ? (
        <p className="nd">配分できる口座がありません</p>
      ) : (
        <>
          <p className="text-m" style={{ fontSize: 12, marginBottom: 10 }}>
            配分は残高を動かしません。「この口座のうち、いくらを何に取っておくか」という目安です。記帳でタグを付けると、そのタグの残りが増減します。
          </p>
          {rows.map((r) => {
            const flow = flows[r.account.id] || {};
            const used = Object.values(flow).reduce((s, v) => s + v, 0);
            const allocated = tags.reduce((s, g) => s + toAmount(draft[key(r.account.id, g.id)]), 0);
            // 未配分は、入れた配分だけでなく記帳でタグを付けた分も引く（引かないと使った分が未配分に戻って見える）
            const free = r.bal - allocated - used;
            return (
              <div key={r.account.id} className="ta-card">
                <div className="ta-card-h">
                  <span className="ta-card-name">{r.account.name}</span>
                  <span className="ta-card-bal">残高 {faBal(r.bal)}</span>
                </div>
                {tags.map((g) => {
                  const left = toAmount(draft[key(r.account.id, g.id)]) + (flow[g.id] || 0);
                  return (
                    <div key={g.id} className="ta-row">
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, fontSize: 13 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: g.color, flex: 'none' }} />
                        {g.name}
                        {flow[g.id] ? (
                          <span className="text-m" style={{ fontSize: 11, color: left < 0 ? 'var(--red)' : undefined }}>
                            残り {faBal(left)}
                          </span>
                        ) : null}
                      </span>
                      <input type="text" inputMode="numeric" className="fc mono text-r" placeholder="0"
                        style={{ width: 130 }}
                        value={draft[key(r.account.id, g.id)] ?? ''}
                        onChange={(e) => setDraft((d) => ({ ...d, [key(r.account.id, g.id)]: e.target.value }))} />
                    </div>
                  );
                })}
                <div className="ta-free" style={{ display: 'flex', justifyContent: 'space-between', color: free < 0 ? 'var(--red)' : undefined }}>
                  <span>未配分</span>
                  <span className="mono">{faBal(free)}{free < 0 ? '（配分超過）' : ''}</span>
                </div>
              </div>
            );
          })}
        </>
      )}
    </Modal>
  );
}
