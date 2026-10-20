// あとから開始残高を入れる（2026-10-15 決定）。純関数（保存も画面も触らない）。検証は openingBalance.check.mjs。
//
// オンボーディングで残高を空欄にした人・「あとで」で飛ばした人が、あとから口座の残高を入れる道。
// 以前は既存の科目に開始残高の欄が無く、実査で入れるしかなかった（差額が雑収入になり、損益計算書が膨らむ）。
//
// ⚠ 開始残高の仕訳がまだ無い科目にだけ出すこと。あるのに足すと、開いて保存するたびに二重に積み上がる
//   （accounts.jsx の新規作成で「新規のときだけ」にしているのと同じ理由）。
//
// 聞き方は区分で変える（オンボーディングと同じ）:
//   資産 … いまの残高。帳簿の今日の残高との差を、この科目の最初の記帳の前日に置く。
//          先に記帳していても今日の残高が入れた額に合い、過去の推移もずれない。
//   負債 … 次の引き落とし予定額・いま借りている額（入れた額のまま）。カード（締め日あり）は直前の締め日に置く
//          （次回の引落サイクルに乗る。wallets.jsx のカード追加と同じ）。ほかは最初の記帳の前日、記帳が無ければ今日。
//
// .js の拡張子付きで import しているのは、node で検証スクリプトを走らせるため（merge.js と同じ）。
import { EQUITY_ID } from './accountCode.js';
import { accountBalance, calcBalances } from './bookkeeping.js';
import { lastClosingDate } from './creditCard.js';

/** 開始残高を入れられる区分か（資産と負債だけ。収益・費用に「いまいくらある」は無い） */
export const canHaveOpening = (a) => a?.type === 'asset' || a?.type === 'liability';

/** 開始残高の仕訳か（2行で、相手が元入金） */
export function isOpeningJournal(j) {
  const ids = (j?.lines || []).map((l) => l.accountId);
  return ids.length === 2 && ids.includes(EQUITY_ID) && ids.some((id) => id !== EQUITY_ID);
}

/** この科目に開始残高の仕訳（相手が元入金だけの仕訳）があるか */
export function hasOpening(accountId, journals) {
  return (journals || []).some((j) => isOpeningJournal(j) && j.lines.some((l) => l.accountId === accountId));
}

const pad = (n) => String(n).padStart(2, '0');
const prevDay = (ymd) => {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d - 1);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
};

/**
 * あとから入れる開始残高の仕訳。入れる必要が無ければ null（金額が0・差が無い・元入金が無い）。
 *
 * @param {object} p
 * @param {object} p.account 対象の科目
 * @param {string|number} p.input 入れた額（資産はいまの残高、負債は次の引落額・借りている額）
 * @param {object[]} p.journals
 * @param {object[]} p.accounts
 * @param {string} p.todayStr YYYY-MM-DD
 * @param {() => string} p.newId
 * @param {Date} [p.now] カードの直前の締め日を決める基準（検証用）
 */
export function openingJournal({ account, input, journals, accounts, todayStr, newId, now = new Date() }) {
  if (!canHaveOpening(account)) return null;
  // 相手科目が無いと貸借が合わない。消された端末では作らない（黙って壊れた仕訳を作らない）
  if (!accounts.some((a) => a.id === EQUITY_ID)) return null;
  const v = Math.round(parseFloat(String(input ?? '').replace(/[¥,，\s]/g, '')) || 0);
  if (!v || (account.type === 'liability' && v < 0)) return null;

  const first = (journals || [])
    .filter((j) => (j.lines || []).some((l) => l.accountId === account.id))
    .reduce((m, j) => (!m || j.date < m ? j.date : m), '');
  const before = first ? (prevDay(first) < todayStr ? prevDay(first) : todayStr) : todayStr;

  let amount;
  let date;
  if (account.type === 'asset') {
    const book = accountBalance(account.id, accounts, calcBalances((journals || []).filter((j) => j.date <= todayStr), accounts));
    amount = v - book;
    date = before;
  } else {
    amount = v;
    date = account.ccClose ? lastClosingDate(account.ccClose, now) : before;
  }
  if (!amount) return null;

  const n = Math.abs(amount);
  // 資産が増える向き＝(借)科目/(貸)元入金。負債が増える向きと、資産が減る向き＝(借)元入金/(貸)科目
  const intoAccount = account.type === 'asset' && amount > 0;
  const lines = intoAccount
    ? [{ accountId: account.id, side: 'dr', amount: n, taxRate: 0 }, { accountId: EQUITY_ID, side: 'cr', amount: n, taxRate: 0 }]
    : [{ accountId: EQUITY_ID, side: 'dr', amount: n, taxRate: 0 }, { accountId: account.id, side: 'cr', amount: n, taxRate: 0 }];
  return { id: newId(), date, desc: `開始残高（${account.name}）`, lines };
}

/**
 * 入れ済みの残高を直す（2026-10-18 決定）。口座の編集画面の「いまの残高」から。
 * 開始残高がすでにある資産の口座で、入れた額と帳簿の今日の残高の差を、今日の日付で元入金との仕訳にする。
 * 差が無い・空欄なら null（開いて保存するだけでは何も積まない）。
 *
 * 相手を元入金にするのは、残高の入れ違いを直す操作で、使ったお金ではないから（費用・収益に入れると損益計算書がずれる）。
 * 記帳漏れで実際に減った分を費用として合わせたいときは、実査・評価替えを使う。
 */
export function adjustJournal({ account, input, journals, accounts, todayStr, newId }) {
  if (account?.type !== 'asset') return null;
  if (!accounts.some((a) => a.id === EQUITY_ID)) return null;
  const raw = String(input ?? '').replace(/[¥,，\s]/g, '');
  if (raw === '') return null;
  const v = Math.round(parseFloat(raw));
  if (!Number.isFinite(v)) return null;
  const book = accountBalance(account.id, accounts, calcBalances((journals || []).filter((j) => j.date <= todayStr), accounts));
  const diff = v - book;
  if (!diff) return null;
  const n = Math.abs(diff);
  const lines = diff > 0
    ? [{ accountId: account.id, side: 'dr', amount: n, taxRate: 0 }, { accountId: EQUITY_ID, side: 'cr', amount: n, taxRate: 0 }]
    : [{ accountId: EQUITY_ID, side: 'dr', amount: n, taxRate: 0 }, { accountId: account.id, side: 'cr', amount: n, taxRate: 0 }];
  return { id: newId(), date: todayStr, desc: `残高の調整（${account.name}）`, lines };
}

/**
 * カードに締め日を初めて入れたとき、開始残高（次の引き落とし予定額）の仕訳を直前の締め日へ移す。
 * 移す必要が無ければ null。
 *
 * オンボーディングで入れたカードの額は、締め日を聞かないので今日の日付で記帳される。そのまま締め日を入れると
 * 締め前のサイクルに入り、次回の引落に乗らず1サイクル先へずれる（docs/tour-story-2026-10.md 4章 差13）。
 * 直前の締め日より後にある開始残高だけを動かす（すでに締め済みのサイクルにあるものは、そのままで正しい）。
 */
export function redatedCardOpening(account, journals, now = new Date()) {
  if (account?.type !== 'liability' || !account.ccClose) return null;
  const close = lastClosingDate(account.ccClose, now);
  const j = (journals || []).find((x) => isOpeningJournal(x) && x.lines.some((l) => l.accountId === account.id && l.side === 'cr'));
  return j && j.date > close ? { ...j, date: close } : null;
}
