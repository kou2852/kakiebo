import { useState, useMemo } from 'react';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';
import { fa, esc, ACCOUNT_TYPES, BADGE_CLASSES } from '../../utils/format';
import { calcBalances, accountBalance } from '../../utils/bookkeeping';
import CCSettleModal from '../Credit/CCSettleModal';
import { useToast } from '../Common/Toast';
import InfoTip from '../Common/InfoTip';
import { GUEST_LIMITS } from '../../config/tiers';
import AccountModal from './AccountModal';
import RuleModal from './RuleModal';
import WalletModal from './WalletModal';
import PresetModal from './PresetModal';

// 純資産（家族のBS）に効く科目テンプレ。クリックでモーダルに内容をプリフィルし、編集してから追加できる。
const ACCOUNT_TEMPLATES = [
  { name: '銀行口座', type: 'asset', code: '1011' },
  { name: 'クレジットカード', type: 'liability', code: '2102' },
  { name: 'NISA口座', type: 'asset', code: '1211' },
  { name: 'iDeCo', type: 'asset', code: '1212' },
  { name: '証券口座', type: 'asset', code: '1213' },
  { name: '積立保険', type: 'asset', code: '1214' },
  { name: '住宅ローン', type: 'liability', code: '2211' },
  { name: '自動車ローン', type: 'liability', code: '2212' },
  { name: '奨学金', type: 'liability', code: '2213' },
];

export default function AccountsPage() {
  const { accounts, journals, wallets, presets, rules, budgets, allocs, addJournal, updateAccount, deleteAccount, saveWallets, setPresets, setRules, loading } = useData();
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
    setAcctPrefill({ name: t.name, type: t.type, code: t.code });
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

  const handleDeletePreset = (id) => {
    if (!confirm('削除しますか？')) return;
    setPresets((prev) => prev.filter((p) => p.id !== id));
    toast('削除しました');
  };

  const handleDeleteRule = (id) => {
    if (!confirm('削除しますか？')) return;
    setRules((prev) => prev.filter((r) => r.id !== id));
    toast('削除しました');
  };

  // クレカ等（CC設定済み負債科目）の現在の未払残高
  const allBal = useMemo(() => calcBalances(journals, accounts), [journals, accounts]);
  const ccAccounts = useMemo(
    () => accounts.filter((a) => a.type === 'liability' && a.ccDay && a.ccFrom && a.ccClose),
    [accounts]
  );

  // クレカ返済の記帳は確認モーダル（CCSettleModal）で対象を選んで実行する。
  const [ccModalOpen, setCcModalOpen] = useState(false);

  if (loading) return <p className="nd">読み込み中...</p>;

  return (
    <div>
      <div className="pg-header pg-header-row">
        <div>
          <div className="pg-title">勘定科目・口座管理</div>
          <div className="pg-sub">科目と口座を管理します</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-p" onClick={openNewAccount}>＋ 科目</button>
          <button className="btn btn-g" onClick={openNewWallet}>＋ 口座</button>
        </div>
      </div>

      {/* タブ */}
      <div className="tab-bar">
        {Object.entries(ACCOUNT_TYPES).map(([k, v]) => (
          <div key={k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{v}</div>
        ))}
      </div>

      {/* 純資産テンプレ（NISA/iDeCo/証券/ローン）。クリックで内容を編集してから追加。再追加できるよう常に表示。 */}
      <div className="card" style={{ marginBottom: 14, padding: '12px 16px' }}>
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
                <th>CC設定</th>
                <th />
              </tr></thead>
              <tbody>
                {filtered.map((a) => {
                  const cc = a.ccDay ? `締${a.ccClose || '?'}日→${a.ccDelay || 1}ヶ月後${a.ccDay}日 / ${acctName(a.ccFrom)}` : '—';
                  return (
                    <tr key={a.id}>
                      <td className="mono text-m">{a.code || ''}</td>
                      <td>{a.name}</td>
                      <td><span className={`bdg ${BADGE_CLASSES[a.type]}`}>{ACCOUNT_TYPES[a.type]}</span></td>
                      <td className="text-m" style={{ fontSize: 11 }}>{a.type === 'liability' ? cc : ''}</td>
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
        <div className="card-title">口座一覧</div>
        <div className="card">
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
            <InfoTip text="負債科目（クレカ等）に『CC設定』（締め日・引落日・引落月ずれ・引落口座）を設定すると、締め済みの利用額を集計し、当月の引落日に『クレカ→引落口座』の返済仕訳をまとめて生成できます。利用月（発生）と支払月（引落）が分かれて記帳されます。" />
          </span>
          <button className="btn btn-p btn-s" onClick={() => setCcModalOpen(true)}>クレカ返済を記帳</button>
        </div>
        <div className="card">
          {ccAccounts.length === 0 ? (
            <p className="nd">
              CC設定のあるカードがありません。「負債」タブで科目を編集し『CC設定』（締め日・引落日・引落口座）を入力すると、ここで返済仕訳を自動生成できます。
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
