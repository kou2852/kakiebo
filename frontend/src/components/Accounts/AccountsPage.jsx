import { useState, useMemo } from 'react';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';
import { fa, esc, uid, today, ACCOUNT_TYPES, BADGE_CLASSES } from '../../utils/format';
import { calcBalances, accountBalance } from '../../utils/bookkeeping';
import { EQUITY_ID, nextCode } from '../../utils/accountCode';
import { lastClosingDate } from '../../utils/creditCard';
import CCSettleModal from '../Credit/CCSettleModal';
import { useToast } from '../Common/Toast';
import InfoTip from '../Common/InfoTip';
import { GUEST_LIMITS } from '../../config/tiers';
import AccountModal from './AccountModal';
import RuleModal from './RuleModal';
import WalletModal from './WalletModal';
import PresetModal from './PresetModal';

// 純資産（家族のBS）に効く科目テンプレ。クリックでモーダルに内容をプリフィルし、編集してから追加できる。
// wallet は「口座として使う」の初期値。支払い・入金の起点になるものだけ ON にする
// （ローンはそこから支払わないので OFF）。モーダル側で変更できる。
const ACCOUNT_TEMPLATES = [
  { name: '銀行口座', type: 'asset', code: '1011', wallet: true },
  { name: 'クレジットカード', type: 'liability', code: '2102', wallet: true },
  { name: 'NISA口座', type: 'asset', code: '1211', wallet: true },
  { name: 'iDeCo', type: 'asset', code: '1212', wallet: true },
  { name: '証券口座', type: 'asset', code: '1213', wallet: true },
  { name: '積立保険', type: 'asset', code: '1214', wallet: true },
  { name: '住宅ローン', type: 'liability', code: '2211', wallet: false },
  { name: '自動車ローン', type: 'liability', code: '2212', wallet: false },
  { name: '奨学金', type: 'liability', code: '2213', wallet: false },
];

const QUICK_ACCOUNT_TYPES = [
  { label: '🏦 銀行口座', name: '銀行口座', type: 'asset' },
  { label: '💳 クレジットカード', name: 'クレジットカード', type: 'liability' },
  { label: '💰 現金', name: '現金', type: 'asset' },
  { label: '📈 NISA口座', name: 'NISA口座', type: 'asset' },
];

export default function AccountsPage() {
  const { accounts, journals, wallets, presets, rules, budgets, allocs, addAccount, addJournal, updateAccount, deleteAccount, saveWallets, savePresets, saveRules, loading } = useData();
  const { guestMode } = useAuth();
  const toast = useToast();

  const openNewAccount = () => {
    // 上限はユーザー追加科目（システム科目は除外）に対して
    if (guestMode && accounts.filter((a) => !a.sys).length >= GUEST_LIMITS.accounts) {
      toast(`ゲストは追加科目を${GUEST_LIMITS.accounts}件まで作成できます。アカウント登録で解除されます`);
      return;
    }
    setAcctEditId(null); setAcctPrefill(null); setAcctModalOpen(true);
  };

  const openNewWallet = () => {
    if (guestMode && wallets.length >= GUEST_LIMITS.wallets) {
      toast(`ゲストは口座を${GUEST_LIMITS.wallets}件まで作成できます。アカウント登録で解除されます`);
      return;
    }
    setWalletEditId(null); setWalletModalOpen(true);
  };

  // テンプレは即追加せず、内容をプリフィルしたモーダルを開いて編集・保存させる。
  const openTemplate = (t) => {
    if (guestMode && accounts.filter((a) => !a.sys).length >= GUEST_LIMITS.accounts) {
      toast(`ゲストは追加科目を${GUEST_LIMITS.accounts}件まで作成できます。アカウント登録で解除されます`);
      return;
    }
    setAcctEditId(null);
    setAcctPrefill({ name: t.name, type: t.type, code: t.code, wallet: t.wallet });
    setTab(t.type);
    setAcctModalOpen(true);
  };
  const [tab, setTab] = useState('asset');
  const [sortKey, setSortKey] = useState('code');
  const [sortDir, setSortDir] = useState('asc');
  const [acctModalOpen, setAcctModalOpen] = useState(false);
  const [acctEditId, setAcctEditId] = useState(null);
  const [acctPrefill, setAcctPrefill] = useState(null);
  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [ruleEditId, setRuleEditId] = useState(null);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [walletEditId, setWalletEditId] = useState(null);
  const [presetModalOpen, setPresetModalOpen] = useState(false);
  const [presetEditId, setPresetEditId] = useState(null);
  const [presetWalletId, setPresetWalletId] = useState(null);
  const [presetType, setPresetType] = useState('out');
  const [quickAccount, setQuickAccount] = useState(QUICK_ACCOUNT_TYPES[0]);
  const [quickName, setQuickName] = useState(QUICK_ACCOUNT_TYPES[0].name);
  const [quickBalance, setQuickBalance] = useState('');
  const [quickCcClose, setQuickCcClose] = useState('15');
  const [quickCcDay, setQuickCcDay] = useState('27');
  const [quickCcDelay, setQuickCcDelay] = useState('1');
  const [quickCcFrom, setQuickCcFrom] = useState('');
  // かんたん登録の4種（銀行・カード・現金・NISA）はどれも支払い・入金の起点になるので既定でON
  const [quickWallet, setQuickWallet] = useState(true);
  const quickAssetAccounts = useMemo(() => accounts.filter((a) => a.type === 'asset'), [accounts]);

  const defaultQuickCcFrom = () => quickAssetAccounts.find((a) => a.name === '普通預金')?.id || quickAssetAccounts[0]?.id || '';

  const selectQuickAccount = (option) => {
    setQuickAccount(option);
    setQuickName(option.name);
    setQuickBalance('');
    setQuickCcClose('15');
    setQuickCcDay('27');
    setQuickCcDelay('1');
    setQuickCcFrom(defaultQuickCcFrom());
  };

  const saveQuickAccount = async () => {
    if (guestMode && accounts.filter((a) => !a.sys).length >= GUEST_LIMITS.accounts) {
      toast(`ゲストは追加科目を${GUEST_LIMITS.accounts}件まで作成できます。アカウント登録で解除されます`);
      return;
    }
    const name = quickName.trim();
    if (!name) { toast('科目名を入力してください'); return; }
    if (quickAccount.type === 'liability' && !quickCcFrom) { toast('引落口座を選択してください'); return; }
    try {
      const data = { name, type: quickAccount.type, code: nextCode(accounts, quickAccount.type), note: '' };
      if (quickAccount.type === 'liability') {
        data.ccClose = parseInt(quickCcClose) || 0;
        data.ccDay = parseInt(quickCcDay) || 0;
        data.ccDelay = parseInt(quickCcDelay) || 1;
        data.ccFrom = quickCcFrom || '';
      }
      const created = await addAccount(data);
      // 科目だけ作って口座を作らないと、プリセットも残高の配分も使えないまま増えていく
      if (quickWallet) {
        await saveWallets([...wallets, {
          id: uid(), name, accountId: created.id,
          defaultTagName: '', defaultTagColor: '#888', note: '',
        }]);
      }
      const balance = Math.round(parseFloat(String(quickBalance).replace(/[¥,，]/g, '')) || 0);
      if (balance > 0) {
        const lines = quickAccount.type === 'asset'
          ? [{ accountId: created.id, side: 'dr', amount: balance, taxRate: 0 }, { accountId: EQUITY_ID, side: 'cr', amount: balance, taxRate: 0 }]
          : [{ accountId: EQUITY_ID, side: 'dr', amount: balance, taxRate: 0 }, { accountId: created.id, side: 'cr', amount: balance, taxRate: 0 }];
        // カードの開始残高は「次回の引落額」。直前の締め日に置くと次回引落のサイクルに乗る
        const date = data.ccClose ? lastClosingDate(data.ccClose) : today();
        await addJournal({ date, desc: `開始残高（${name}）`, lines }, { silent: true });
      }
      setQuickAccount(QUICK_ACCOUNT_TYPES[0]);
      setQuickName(QUICK_ACCOUNT_TYPES[0].name);
      setQuickBalance('');
      setQuickCcClose('15');
      setQuickCcDay('27');
      setQuickCcDelay('1');
      setQuickCcFrom(defaultQuickCcFrom());
      setQuickWallet(true);
      toast('登録しました');
    } catch { toast('登録に失敗しました'); }
  };

  const acctName = (id) => accounts.find((a) => a.id === id)?.name || '(不明)';

  const filtered = useMemo(() => {
    const ac = accounts.filter((a) => a.type === tab);
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...ac].sort((a, b) => {
      if (sortKey === 'code') return dir * (a.code || '').localeCompare(b.code || '');
      if (sortKey === 'name') return dir * a.name.localeCompare(b.name, 'ja');
      return 0;
    });
  }, [accounts, tab, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const SortTh = ({ k, children }) => (
    <th className={sortKey === k ? `sortable ${sortDir}` : 'sortable'} onClick={() => toggleSort(k)}>
      {children}<span className="sa" />
    </th>
  );

  const handleDelete = async (id) => {
    const a = accounts.find((x) => x.id === id);
    if (a?.sys) { toast('システム科目は削除できません'); return; }
    // 使用中チェック（参照の孤立＝「(不明)」表示や残高欠落を防ぐ）
    const used = [];
    if (journals.some((j) => j.lines.some((l) => l.accountId === id))) used.push('仕訳');
    if (wallets.some((w) => w.accountId === id)) used.push('口座');
    if (presets.some((p) => (p.lines || []).some((l) => l.accountId === id))) used.push('プリセット');
    if (rules.some((r) => r.drAccountId === id || r.crAccountId === id)) used.push('自動分類ルール');
    if ((budgets || []).some((b) => b.accountId === id)) used.push('予算');
    if ((allocs || []).some((al) => al.accountId === id)) used.push('タグ配分');
    if (accounts.some((x) => x.ccFrom === id)) used.push('クレカの引落口座');
    if (used.length) { toast(`この科目は${used.join('・')}で使用中のため削除できません`); return; }
    if (!confirm('削除しますか？')) return;
    try { await deleteAccount(id); toast('削除しました'); } catch { toast('削除に失敗'); }
  };

  const handleDeleteWallet = async (id) => {
    if (!confirm('削除しますか？')) return;
    try { await saveWallets(wallets.filter((w) => w.id !== id)); toast('削除しました'); } catch { toast('削除に失敗'); }
  };

  const openPreset = (editId, walletId, type) => {
    setPresetEditId(editId); setPresetWalletId(walletId); setPresetType(type); setPresetModalOpen(true);
  };

  const handleDeletePreset = async (id) => {
    if (!confirm('削除しますか？')) return;
    try {
      await savePresets(presets.filter((p) => p.id !== id), { op: 'delete', id });
      toast('削除しました');
    } catch { toast('削除に失敗しました'); }
  };

  const handleDeleteRule = async (id) => {
    if (!confirm('削除しますか？')) return;
    try {
      await saveRules(rules.filter((r) => r.id !== id), { op: 'delete', id });
      toast('削除しました');
    } catch { toast('削除に失敗しました'); }
  };

  // クレカ等（引き落とし設定済み負債科目）の現在の未払残高
  const allBal = useMemo(() => calcBalances(journals, accounts), [journals, accounts]);
  const ccAccounts = useMemo(
    () => accounts.filter((a) => a.type === 'liability' && a.ccDay && a.ccFrom && a.ccClose),
    [accounts]
  );
  // 仕訳に登場する科目。引き落とし未設定の警告を「使っているカード」だけに絞るために使う
  const usedAccountIds = useMemo(
    () => new Set(journals.flatMap((j) => j.lines.map((l) => l.accountId))),
    [journals]
  );

  // クレカ返済の記帳は確認モーダル（CCSettleModal）で対象を選んで実行する。
  const [ccModalOpen, setCcModalOpen] = useState(false);

  if (loading) return <p className="nd">読み込み中...</p>;

  return (
    <div>
      {/* タブもヘッダーに入れて一緒に画面上部へ貼り付ける。
          科目一覧は縦に長く、区分を切り替えるたびに上まで戻るのが手間だったため。 */}
      <div className="pg-header">
        <div className="pg-header-row">
          <div>
            <div className="pg-title">勘定科目・口座管理</div>
            <div className="pg-sub">科目と口座を管理します</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-p" onClick={openNewAccount}>＋ 科目</button>
            <button className="btn btn-p" onClick={openNewWallet}>＋ 口座</button>
          </div>
        </div>
        <div className="tab-bar">
          {Object.entries(ACCOUNT_TYPES).map(([k, v]) => (
            <div key={k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{v}</div>
          ))}
        </div>
      </div>

      <div className="card" data-tour="quick-account" style={{ marginBottom: 14, padding: '12px 16px' }}>
        <div style={{ fontSize: 12, color: 'var(--tx3)', marginBottom: 8 }}>かんたん登録</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="fg" style={{ flex: '1 1 100%', minWidth: 0 }}>
            <label className="fl">種別</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {QUICK_ACCOUNT_TYPES.map((option) => (
                <button key={option.label} type="button" className={`btn btn-s ${quickAccount.label === option.label ? 'btn-p' : 'btn-g'}`} onClick={() => selectQuickAccount(option)}>
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="fg" style={{ flex: '1 1 180px', minWidth: 0 }}>
            <label className="fl">名前</label>
            <input type="text" className="fc" maxLength={50} value={quickName} onChange={(e) => setQuickName(e.target.value)} />
          </div>
          <div className="fg" style={{ flex: '1 1 140px', minWidth: 0 }}>
            <label className="fl">{quickAccount.name === 'NISA口座' ? '評価額（任意）' : quickAccount.type === 'liability' ? '次回の引落額（任意）' : '残高（任意）'}</label>
            <input type="text" inputMode="numeric" className="fc" placeholder="0" value={quickBalance} onChange={(e) => setQuickBalance(e.target.value)} />
            {quickAccount.type === 'liability' && (
              <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 4 }}>請求が確定して、まだ引き落とされていない額（カード会社アプリの「今月のお支払い金額」）</div>
            )}
          </div>
          <button className="btn btn-p" style={{ flex: '0 0 auto' }} onClick={saveQuickAccount}>登録する</button>
          <label style={{ flex: '1 1 100%', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--tx2)', cursor: 'pointer' }}>
            <input type="checkbox" checked={quickWallet} onChange={(e) => setQuickWallet(e.target.checked)} />
            口座一覧にも登録する（プリセットと残高の配分に使えます）
          </label>
          {quickAccount.type === 'liability' && (
            <div style={{ flex: '1 1 100%', minWidth: 0, marginTop: 14, padding: 12, border: '1px solid var(--bd)', borderRadius: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ac)', marginBottom: 10 }}>引き落とし設定</div>
              <div className="form-row">
                <div className="fg"><label className="fl">締め日（毎月）</label><input type="number" className="fc" min="1" max="31" placeholder="15" value={quickCcClose} onChange={(e) => setQuickCcClose(e.target.value)} /></div>
                <div className="fg"><label className="fl">引落日（毎月）</label><input type="number" className="fc" min="1" max="31" placeholder="27" value={quickCcDay} onChange={(e) => setQuickCcDay(e.target.value)} /></div>
              </div>
              <div className="form-row mt-6">
                <div className="fg"><label className="fl">引き落とし月</label>
                  <select className="fc" value={quickCcDelay} onChange={(e) => setQuickCcDelay(e.target.value)}>
                    <option value="1">翌月</option><option value="2">翌々月</option>
                  </select>
                </div>
                <div className="fg"><label className="fl">引落口座</label>
                  <select className="fc" value={quickCcFrom} onChange={(e) => setQuickCcFrom(e.target.value)}>
                    <option value="">— 選択 —</option>
                    {quickAssetAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 純資産テンプレ（NISA/iDeCo/証券/ローン）。クリックで内容を編集してから追加。再追加できるよう常に表示。 */}
      <div className="card" data-tour="acct-templates" style={{ marginBottom: 14, padding: '12px 16px' }}>
        <div style={{ fontSize: 12, color: 'var(--tx3)', marginBottom: 8 }}>
          💡 口座・カード・投資・ローンをテンプレから追加（クリックで内容を編集してから保存）
        </div>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
          {ACCOUNT_TEMPLATES.map((t) => (
            <button key={t.name} className="btn btn-g btn-s" style={{ flex: '0 0 auto', whiteSpace: 'nowrap' }} onClick={() => openTemplate(t)}>
              ＋ {t.name}
              <span style={{ fontSize: 10, color: 'var(--tx3)', marginLeft: 4 }}>{t.type === 'asset' ? '資産' : '負債'}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 勘定科目一覧 */}
      <div className="card">
        {filtered.length === 0 ? <p className="nd">科目なし</p> : (
          <div className="tw">
            <table>
              <thead><tr>
                <SortTh k="code">コード</SortTh>
                <SortTh k="name">科目名</SortTh>
                <th>区分</th>
                <th>引き落とし</th>
                <th />
              </tr></thead>
              <tbody>
                {filtered.map((a) => {
                  // 締め日・引落日・引落口座は3つ揃って初めて機能する。欠けていれば静かに無効なので警告する。
                  const ccDone = !!(a.ccClose && a.ccDay && a.ccFrom);
                  const ccAny = !!(a.ccClose || a.ccDay || a.ccFrom);
                  const ccMissing = [!a.ccClose && '締め日', !a.ccDay && '引落日', !a.ccFrom && '引落口座'].filter(Boolean);
                  const cc = `締${a.ccClose}日→${a.ccDelay || 1}ヶ月後${a.ccDay}日 / ${acctName(a.ccFrom)}`;
                  return (
                    <tr key={a.id}>
                      <td className="mono text-m">{a.code || ''}</td>
                      <td>{a.name}</td>
                      <td><span className={`bdg ${BADGE_CLASSES[a.type]}`}>{ACCOUNT_TYPES[a.type]}</span></td>
                      <td className="text-m" style={{ fontSize: 11 }}>
                        {a.type !== 'liability' ? '' : ccDone ? cc
                          : (ccAny || usedAccountIds.has(a.id)) ? (
                            <button className="bdg bdg-l"
                              style={{ border: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 }}
                              onClick={() => { setAcctEditId(a.id); setAcctModalOpen(true); }}>
                              {ccAny ? `設定が未完了：${ccMissing.join('・')}` : '引き落とし未設定'}
                            </button>
                          ) : '—'}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn btn-g btn-s" onClick={() => { setAcctEditId(a.id); setAcctModalOpen(true); }}>編集</button>
                        {!a.sys && <button className="btn btn-d btn-s" style={{ marginLeft: 4 }} onClick={() => handleDelete(a.id)}>削除</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 口座一覧 */}
      <div style={{ marginTop: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>口座一覧</div>
          <button className="btn btn-p btn-s" onClick={openNewWallet}>＋ 口座</button>
        </div>
        <div className="card" style={{ marginTop: 10 }}>
          {wallets.length === 0 ? <p className="nd">口座なし。「＋ 口座」から追加してください。</p> : (
            wallets.map((w) => {
              const wPresets = presets.filter((p) => p.walletId === w.id);
              return (
                <div key={w.id} className="ta-card">
                  <div className="ta-card-h">
                    <div>
                      <span className="ta-card-name">{w.name}</span>
                      <span className="text-m" style={{ fontSize: 11, marginLeft: 6 }}>{acctName(w.accountId)}</span>
                      {w.defaultTagName && (
                        <span className="tag-chip" style={{ background: w.defaultTagColor || '#888', fontSize: 9, marginLeft: 6 }}>{w.defaultTagName}</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 5 }}>
                      <button className="btn btn-g btn-s" onClick={() => { setWalletEditId(w.id); setWalletModalOpen(true); }}>編集</button>
                      <button className="btn btn-d btn-s" onClick={() => handleDeleteWallet(w.id)}>削除</button>
                    </div>
                  </div>
                  {wPresets.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
                      {wPresets.map((p) => (
                        <span key={p.id} className="preset-chip" onClick={() => openPreset(p.id, w.id, p.type)}>
                          <span style={{ color: p.type === 'in' ? 'var(--grn)' : 'var(--red)' }}>{p.type === 'in' ? '入' : '出'}</span> {p.name}
                          <button className="preset-chip-x" onClick={(e) => { e.stopPropagation(); handleDeletePreset(p.id); }}>✕</button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: 'var(--tx3)' }}>よく使う仕訳をワンタップ登録:</span>
                    <button className="btn btn-g btn-s" onClick={() => openPreset(null, w.id, 'in')}>＋ 入金プリセット</button>
                    <button className="btn btn-g btn-s" onClick={() => openPreset(null, w.id, 'out')}>＋ 出金プリセット</button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* クレジットカード返済 */}
      <div className="rule-sec">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="card-title">
            クレジットカード返済
            <InfoTip text="負債科目（クレカ等）に『引き落とし設定』（締め日・引落日・引き落とし月・引落口座）を設定すると、締め済みの利用額を集計し、当月の引落日に『クレカ→引落口座』の返済仕訳をまとめて生成できます。利用月（発生）と支払月（引落）が分かれて記帳されます。" />
          </span>
          <button className="btn btn-p btn-s" onClick={() => setCcModalOpen(true)}>クレカ返済を記帳</button>
        </div>
        <div className="card">
          {ccAccounts.length === 0 ? (
            <p className="nd">
              引き落とし設定のあるカードがありません。「負債」タブで科目を編集し『引き落とし設定』（締め日・引落日・引落口座）を入力すると、ここで返済仕訳を自動生成できます。
            </p>
          ) : (
            <>
              <p style={{ fontSize: 12, color: 'var(--tx3)', margin: '0 0 10px' }}>
                「クレカ返済を記帳」で、締め済み・未引落のサイクルを一覧し、チェックで選んで記帳できます。引落日到来分は初期選択、<strong>引落前のサイクルも選べば予定として先に記帳</strong>できます（クレジット画面のサイクルに準拠／重複しません）。
              </p>
              <div className="tw">
                <table>
                  <thead><tr><th>カード</th><th>未払残高</th><th>締め日</th><th>引落</th><th>引落口座</th></tr></thead>
                  <tbody>
                    {ccAccounts.map((c) => (
                      <tr key={c.id}>
                        <td>{c.name}</td>
                        <td className="text-r mono">{fa(Math.max(0, accountBalance(c.id, accounts, allBal)))}</td>
                        <td className="text-m">毎月{c.ccClose}日</td>
                        <td className="text-m">{(c.ccDelay || 1) > 1 ? '翌々月' : '翌月'}{c.ccDay}日</td>
                        <td className="text-m">{acctName(c.ccFrom)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 自動分類ルール */}
      <div className="rule-sec">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="card-title">
            自動分類ルール
            <InfoTip text="摘要に特定キーワードを含む取引を、決めた借方/貸方科目へ自動で振り分けます。例: キーワード『コンビニ』→借方:食費／貸方:現金。CSV取込時とクイック入力時に適用されます。" />
          </span>
          <button className="btn btn-g btn-s" onClick={() => { setRuleEditId(null); setRuleModalOpen(true); }}>＋ ルール</button>
        </div>
        <div className="card">
          <p style={{ fontSize: 12, color: 'var(--tx3)', margin: '0 0 10px' }}>
            「キーワード → 借方/貸方科目」を登録しておくと、<strong>CSV取込</strong>やクイック入力で摘要にそのキーワードを含む取引が自動分類されます。
            例:「コンビニ」→ 借方「食費」／貸方「現金」。
          </p>
          {rules.length === 0 ? (
            <p className="nd">ルールはまだありません。「＋ ルール」から、よく使う店名・摘要のキーワードと科目の対応を登録してください。</p>
          ) : (
            <div className="tw">
              <table>
                <thead><tr><th>キーワード</th><th>借方科目</th><th>貸方科目</th><th /></tr></thead>
                <tbody>
                  {rules.map((r) => (
                    <tr key={r.id}>
                      <td><strong>{r.keyword}</strong></td>
                      <td>{acctName(r.drAccountId)}</td>
                      <td>{acctName(r.crAccountId)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn btn-g btn-s" onClick={() => { setRuleEditId(r.id); setRuleModalOpen(true); }}>編集</button>
                        <button className="btn btn-d btn-s" style={{ marginLeft: 4 }} onClick={() => handleDeleteRule(r.id)}>削除</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <AccountModal open={acctModalOpen} onClose={() => setAcctModalOpen(false)} editId={acctEditId} prefill={acctPrefill} defaultType={tab} />
      <RuleModal open={ruleModalOpen} onClose={() => setRuleModalOpen(false)} editId={ruleEditId} />
      <WalletModal open={walletModalOpen} onClose={() => setWalletModalOpen(false)} editId={walletEditId} />
      <PresetModal open={presetModalOpen} onClose={() => setPresetModalOpen(false)} editId={presetEditId} walletId={presetWalletId} type={presetType} />
      <CCSettleModal open={ccModalOpen} onClose={() => setCcModalOpen(false)} />
    </div>
  );
}
