// frontend/src/components/Journal/QuickEntry.jsx の parse() を抜き出したもの。
// 「食費 1200 現金」のような一行から複式仕訳を組み立てる。UI からは切り離してある。
// ワンライン入力から複式仕訳を組み立てる（kakeibo.html の qeParse を移植）。
// 例: 「食費 1200 現金」「コンビニ 580 / メモ」
export function parseQuickEntry(input, accounts, rules) {
  const raw = input.trim();
  if (!raw) return null;
  const parts = raw.split('/').map((s) => s.trim());
  const main = parts[0];
  const desc = parts[1] || '';
  const tokens = main.split(/\s+/);
  if (tokens.length < 2) return null;

  let amount = 0, amtIdx = -1;
  for (let i = 0; i < tokens.length; i++) {
    const n = parseFloat(tokens[i].replace(/[¥,，]/g, ''));
    if (!isNaN(n) && n > 0) { amount = Math.round(n); amtIdx = i; break; }
  }
  if (amount <= 0) return null;

  const nameTokens = tokens.filter((_, i) => i !== amtIdx);
  const resolved = nameTokens.map((t) =>
    accounts.find((a) => a.name === t) ||
    accounts.find((a) => a.name.includes(t)) ||
    accounts.find((a) => a.code === t) || null
  ).filter(Boolean);

  const matchRule = (text) => text ? rules.find((r) => r.keyword && text.includes(r.keyword)) : null;
  const byId = (id) => accounts.find((x) => x.id === id);

  let drAcct = null, crAcct = null;
  if (resolved.length >= 2) {
    const a = resolved[0], b = resolved[1];
    if ((a.type === 'liability' && b.type === 'asset') || (a.type === 'asset' && b.type === 'liability')) { drAcct = a; crAcct = b; }
    else if (a.type === 'expense' || a.type === 'asset') { drAcct = a; crAcct = b; }
    else if (b.type === 'expense' || b.type === 'asset') { drAcct = b; crAcct = a; }
    else { drAcct = a; crAcct = b; }
  } else if (resolved.length === 1) {
    const a = resolved[0];
    const rule = matchRule(desc || nameTokens.join(' '));
    if (rule) { drAcct = byId(rule.drAccountId); crAcct = byId(rule.crAccountId); }
    else if (a.type === 'expense') { drAcct = a; crAcct = byId('a01') || accounts.find((x) => x.type === 'asset'); }
    else if (a.type === 'income') { crAcct = a; drAcct = byId('a02') || accounts.find((x) => x.type === 'asset'); }
    else if (a.type === 'asset') {
      crAcct = a;
      const rule2 = matchRule(nameTokens.filter((t) => t !== a.name).join(' '));
      drAcct = rule2 ? byId(rule2.drAccountId) : accounts.find((x) => x.type === 'expense');
    } else { drAcct = a; crAcct = accounts.find((x) => x.type === 'asset'); }
  } else {
    const rule = matchRule(raw);
    if (rule) { drAcct = byId(rule.drAccountId); crAcct = byId(rule.crAccountId); }
    else return null;
  }
  if (!drAcct || !crAcct) return null;

  return {
    drAcct, crAcct, amount,
    desc: desc || nameTokens.filter((t) => t !== drAcct.name && t !== crAcct.name).join(' '),
  };
}
