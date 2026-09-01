import { useMemo, useState } from 'react';
import { useData } from '../../contexts/DataContext';
import { useToast } from '../Common/Toast';
import Modal from '../Common/Modal';
import { fa, faBal, fas, today } from '../../utils/format';
import { accountBalance, calcBalances, isInvestmentAsset } from '../../utils/bookkeeping';

// 実査（残高照合）と評価替え。
//
// 銀行APIを使わない方針である以上、帳簿は手入力の漏れで必ずずれる。
// ずれた帳簿の BS も純資産推移も意味を失うので、実残高との突合を最後の砦として持つ。
// 実務の簿記でいう実査そのもので、差額を雑損益に落として帳簿を現実に合わせる。
//
// 評価替えは同じ操作の別用途。投資資産の帳簿価額を時価に合わせ、差額を評価損益に落とす。
// 相手科目が違うだけなので UI を共有している。

const PREFIX = { cash: '残高調整', valuation: '評価替え' };

export default function ReconcileModal({ open, onClose }) {
  const { accounts, journals, addJournal } = useData();
  const toast = useToast();

  const [mode, setMode] = useState('cash');
  const [actual, setActual] = useState({}); // accountId -> 入力中の実残高
  const [busy, setBusy] = useState(false);

  const balances = useMemo(() => calcBalances(journals, accounts), [journals, accounts]);

  // 実査の対象は現金・預金を含む資産と負債。評価替えは投資性の資産だけ。
  const targets = useMemo(() => accounts
    .filter((a) => (mode === 'valuation' ? isInvestmentAsset(a) : (a.type === 'asset' || a.type === 'liability')))
    .sort((a, b) => (a.code || '').localeCompare(b.code || '')),
  [accounts, mode]);

  // 相手科目。実査は雑費／雑収入、評価替えは評価損益。名前で引き、無ければ区分で代替する。
  const pick = (re, type) => accounts.find((a) => re.test(a.name)) || accounts.find((a) => a.type === type);
  const counter = {
    loss: mode === 'valuation' ? pick(/評価損益/, 'income') : pick(/雑費|雑損/, 'expense'),
    gain: mode === 'valuation' ? pick(/評価損益/, 'income') : pick(/雑収入|雑益/, 'income'),
  };

  // 前回いつ合わせたかは、生成した調整仕訳そのものから引く。別途保存しない。
  const lastAdjusted = useMemo(() => {
    const out = {};
    const re = new RegExp(`^(${PREFIX.cash}|${PREFIX.valuation}): (.+)$`);
    journals.forEach((j) => {
      const m = (j.desc || '').match(re);
      if (!m) return;
      const a = accounts.find((x) => x.name === m[2]);
      if (a && (!out[a.id] || j.date > out[a.id])) out[a.id] = j.date;
    });
    return out;
  }, [journals, accounts]);

  const commit = async (account, book, diff) => {
    // 帳簿より実際が多い＝資産が増えている → 借方:その科目 / 貸方:雑収入(評価損益)
    // 帳簿より実際が少ない → 借方:雑費(評価損益) / 貸方:その科目
    const other = diff > 0 ? counter.gain : counter.loss;
    if (!other) {
      toast(mode === 'valuation' ? '「評価損益」の科目を作ってください' : '「雑費」「雑収入」の科目を作ってください');
      return;
    }
    const amount = Math.abs(diff);
    const lines = diff > 0
      ? [{ accountId: account.id, side: 'dr', amount, taxRate: 0 }, { accountId: other.id, side: 'cr', amount, taxRate: 0 }]
      : [{ accountId: other.id, side: 'dr', amount, taxRate: 0 }, { accountId: account.id, side: 'cr', amount, taxRate: 0 }];

    setBusy(true);
    try {
      await addJournal({ date: today(), desc: `${PREFIX[mode]}: ${account.name}`, lines });
      setActual((s) => ({ ...s, [account.id]: '' }));
      toast(`${account.name} を ${fa(amount)} 調整しました`);
    } catch {
      toast('記帳に失敗しました');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="実査・評価替え" wide>
      <div className="fg">
        <div className="tg">
          <button type="button" className={mode === 'cash' ? 'tg-all' : 'tg-pill'} onClick={() => setMode('cash')}>
            実査（残高照合）
          </button>
          <button type="button" className={mode === 'valuation' ? 'tg-all' : 'tg-pill'} onClick={() => setMode('valuation')}>
            評価替え
          </button>
        </div>

        <p className="pg-sub">
          {mode === 'cash'
            ? '通帳や財布の実際の残高を入れると、帳簿との差額を雑費／雑収入で調整します。手入力の漏れはここで吸収します。'
            : '証券口座などの現在の時価を入れると、帳簿価額との差額を評価損益で調整します。'}
        </p>

        {targets.length === 0 ? (
          <p className="nd">{mode === 'valuation' ? '投資性の資産科目がありません' : '対象の科目がありません'}</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>科目</th>
                <th style={{ textAlign: 'right' }}>{mode === 'valuation' ? '帳簿価額' : '帳簿残高'}</th>
                <th style={{ textAlign: 'right' }}>{mode === 'valuation' ? '現在の時価' : '実際の残高'}</th>
                <th style={{ textAlign: 'right' }}>差額</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {targets.map((a) => {
                const book = accountBalance(a.id, accounts, balances);
                const raw = actual[a.id] ?? '';
                const hasInput = String(raw).trim() !== '';
                const real = Number(String(raw).replace(/[^0-9-]/g, '')) || 0;
                const diff = hasInput ? real - book : 0;

                return (
                  <tr key={a.id}>
                    <td>
                      {a.name}
                      <div className="nd" style={{ padding: 0 }}>
                        {lastAdjusted[a.id] ? `前回の調整 ${lastAdjusted[a.id]}` : '調整の記録なし'}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>{faBal(book)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <input
                        className="fc"
                        style={{ width: 130, textAlign: 'right' }}
                        inputMode="numeric"
                        placeholder="0"
                        value={raw}
                        onChange={(e) => setActual((s) => ({ ...s, [a.id]: e.target.value }))}
                      />
                    </td>
                    <td style={{ textAlign: 'right' }} className={diff === 0 ? 'text-m' : ''}>
                      {hasInput ? (diff === 0 ? '一致' : fas(diff)) : '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {hasInput && diff !== 0 ? (
                        <button type="button" className="btn btn-p" disabled={busy} onClick={() => commit(a, book, diff)}>
                          調整
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  );
}
