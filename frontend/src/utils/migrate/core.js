// 他のアプリからの移行：どの形式から読んでも共通の処理（仕訳へのまとめ・科目の組・コードの採番・書き込む形・重複の除外）。
// 形式ごとの読み取りは source.js（CSV・JSON → 列名つきの行）と mapping.js（行 → 明細）、決まった対応付けは presets.js。
// 仕様は docs/plan-migrate-generic-2026-09.md（元は docs/plan-migrate-fukushiki-2026-09.md）。
import { resolveAccount } from '../csv.js';
import { nextCode } from '../accountCode.js';

export const MAX_LINES = 100; // 1仕訳の明細の上限（backend/src/handlers/journals.js と同じ）
/** 貸借が合わない束のエラーの書き出し（画面でこの種類のときだけ説明を足す） */
export const UNBALANCED = '借方と貸方の金額が合いません';
const DESC_MAX = 200;  // 摘要の上限（同上）

/** Excel で保存し直して指数表記に化けた番号（2.02502E+13 など）。全行が同じ値になるので区切りには使えない */
const isMangledNo = (s) => /^\d+(\.\d+)?E\+?\d+$/i.test(s);

const byCode = (a, b) =>
  a.code.localeCompare(b.code, undefined, { numeric: true }) ||
  a.subCode.localeCompare(b.subCode, undefined, { numeric: true });

// 科目コードの先頭の桁 → 区分（推定。画面で変えられる）
const TYPE_BY_DIGIT = { 1: 'asset', 2: 'liability', 3: 'equity', 4: 'income', 5: 'expense' };

/**
 * 連続する明細を、借方合計と貸方合計が一致するまで束ねて仕訳にする。
 * 仕訳No があれば（指数表記に化けていなければ）番号の変わり目でも区切る。
 * 合わない束は取り込まず、元の行番号と中身（lines）つきで errors に出す。1件のエラーで全体を止めない。
 * 明細：{ rowNo, date, voucherNo, memo, side, amount, key, code, name, subCode, subName, role, flow }
 */
export function bundleJournals(details) {
  const journals = [], errors = [];
  let cur = [], dr = 0, cr = 0;
  const rowNos = (ds) => [...new Set(ds.map((d) => d.rowNo))];
  // 画面で「どの行が何だったか」を見せ、仕訳明細の画面で直すための中身（科目の組を作れるよう key なども持つ）
  const lines = (ds) => ds.map(({ rowNo, date, memo, side, amount, key, code, name, subCode, subName, role, flow }) =>
    ({ rowNo, date, memo, side, amount, key, code, name, subCode, subName, role, flow }));
  const fail = (reason) => {
    errors.push({ rowNos: rowNos(cur), reason, lines: lines(cur) });
    cur = []; dr = 0; cr = 0;
  };
  // 仕訳No の変わり目・日付の変わり目・ファイルの終わりのどれで区切れても、利用者に伝えるのは「金額が合わない」こと
  const unbalanced = () => `${UNBALANCED}（借方 ${dr.toLocaleString()}・貸方 ${cr.toLocaleString()}）`;
  const usableNo = (s) => !!s && !isMangledNo(s);

  for (const d of details) {
    if (!d.date || !d.side) {
      errors.push({ rowNos: [d.rowNo], reason: !d.date ? '日付が読めません' : '借方か貸方かが読めません', lines: lines([d]) });
      continue;
    }
    if (cur.length) {
      const prev = cur[cur.length - 1];
      if ((usableNo(prev.voucherNo) && usableNo(d.voucherNo) && prev.voucherNo !== d.voucherNo) || prev.date !== d.date) fail(unbalanced());
    }
    cur.push(d);
    if (d.side === 'dr') dr += d.amount; else cr += d.amount;
    // 1円未満の誤差は許す（小数の足し算の誤差を吸収する）
    if (dr > 0 && cr > 0 && Math.abs(dr - cr) < 1) {
      if (cur.length > MAX_LINES) { fail(`明細が${MAX_LINES}行を超えています（${cur.length}行）`); continue; }
      journals.push({
        date: d.date,
        desc: (cur.find((x) => x.memo) || { memo: '' }).memo,
        rowNos: rowNos(cur),
        lines: cur.map((x) => ({
          key: x.key, code: x.code, name: x.name, subCode: x.subCode, subName: x.subName,
          role: x.role, flow: x.flow, side: x.side, amount: x.amount,
        })),
      });
      cur = []; dr = 0; cr = 0;
    }
  }
  if (cur.length) fail(unbalanced());
  return { journals, errors };
}

/**
 * 新しく作るときの科目名。補助科目があれば「科目名（補助科目名）」。
 * 補助科目名だけだと「職場」「学校」のように何の科目か分からなくなるため、科目名を前に付ける。
 */
export function accountName(name, subCode, subName) {
  if (!subCode || !subName || subName === name) return name;
  return `${name}（${subName}）`;
}

/** 区分の推定。科目コードがあれば先頭の桁、単式なら口座→資産・カテゴリ→支出なら費用/収入なら収益。それ以外は空 */
function guessType(p) {
  if (p.code) return TYPE_BY_DIGIT[p.code[0]] || '';
  if (p.role === 'account') return 'asset';
  if (p.role === 'category') return p.flows.income > p.flows.expense ? 'income' : 'expense';
  return '';
}

/**
 * 仕訳に出てくる科目の組（科目コードがあれば科目コード＋補助科目、無ければ名前＋補助の名前）を一覧にする。
 * 科目コードがあれば科目コード→補助科目コード順、無ければ明細の多い順。
 * master（複式家計簿の科目ファイル）があれば名前と非表示を補う。
 * matchId は、作る名前がくろふくぼの既存科目と一致したときのその科目ID（自動の割り当て先）。
 */
export function buildPairs(journals, master, accounts) {
  const seen = new Map();
  for (const j of journals) {
    for (const l of j.lines) {
      let p = seen.get(l.key);
      if (!p) {
        p = { key: l.key, code: l.code || '', subCode: l.subCode || '', name: l.name, subName: l.subName, role: l.role || '', count: 0, flows: { expense: 0, income: 0 } };
        seen.set(l.key, p);
      }
      p.count++;
      if (l.role === 'category' && p.flows[l.flow] !== undefined) p.flows[l.flow]++;
    }
  }
  const list = [...seen.values()];
  list.sort(list.some((p) => p.code) ? byCode : (a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return list.map((p) => {
    const m = (master && master[p.key]) || {};
    const srcName = m.name || p.name;
    const srcSubName = m.subName || p.subName;
    const name = accountName(srcName, p.subCode || srcSubName, srcSubName);
    return {
      key: p.key, code: p.code, subCode: p.subCode, role: p.role, srcName, srcSubName, count: p.count,
      name,
      type: guessType(p),
      hidden: m.hidden ? 1 : 0,
      matchId: resolveAccount(accounts, name),
    };
  });
}

/**
 * 新しく作る科目のコードを振る。items は buildPairs の並びのまま渡す。
 * 向こうのコードは持ち込まない（既定科目の4桁と並び順が混ざるため）。
 */
export function assignCodes(items, accounts) {
  const used = [...accounts];
  return items.map((it) => {
    const code = nextCode(used, it.type);
    used.push({ id: it.key, code });
    return code;
  });
}

/** 仕訳を addJournal に渡す形へ。ids は 組のキー → くろふくぼの科目ID */
export function toPayload(j, ids) {
  return {
    date: j.date,
    desc: j.desc.slice(0, DESC_MAX),
    lines: j.lines.map((l) => ({ accountId: ids[l.key], side: l.side, amount: l.amount, taxRate: 0 })),
  };
}

const signature = (date, lines) =>
  date + '|' + lines.map((l) => `${l.accountId}:${l.side}:${l.amount}`).sort().join(',');

/**
 * 既存の仕訳と「日付が同じで、明細の（科目・貸借・金額）の組が全部同じ」ものに true を立てる。
 * 既存1件につき取込側1件までしか当てない（同じ日に同じ買い物を2回した記録を、1回分の既存で両方消さない）。
 */
export function markDuplicates(payloads, existing) {
  const left = new Map();
  for (const j of existing) {
    const s = signature(j.date, j.lines || []);
    left.set(s, (left.get(s) || 0) + 1);
  }
  return payloads.map((p) => {
    const s = signature(p.date, p.lines);
    const n = left.get(s) || 0;
    if (n) left.set(s, n - 1);
    return n > 0;
  });
}
