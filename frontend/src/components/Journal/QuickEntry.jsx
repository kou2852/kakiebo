import { useState, useMemo, useEffect } from 'react';
import { useData } from '../../contexts/DataContext';
import { fa, today } from '../../utils/format';
import { useToast } from '../Common/Toast';
import InfoTip from '../Common/InfoTip';

// ワンライン入力から複式仕訳を組み立てる（kakeibo.html の qeParse を移植）。
// 例: 「食費 1200 現金」「コンビニ 580 / メモ」
function parse(input, accounts, rules) {
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

const TYPE_LABEL = { expense: '費用', asset: '資産', liability: '負債', income: '収入', equity: '純資産' };
const TYPE_ORDER = ['expense', 'asset', 'liability', 'income', 'equity'];

export default function QuickEntry() {
  const { accounts, rules, tags, addJournal } = useData();
  const toast = useToast();

  // ── 一行入力（クイック） ──
  const [text, setText] = useState('');
  // ツアーの「入力例を自動入力」から例文を受け取る
  useEffect(() => {
    const h = (e) => { if (typeof e.detail === 'string') setText(e.detail); };
    window.addEventListener('kk:tour-prefill', h);
    return () => window.removeEventListener('kk:tour-prefill', h);
  }, []);
  const preview = useMemo(() => parse(text, accounts, rules), [text, accounts, rules]);
  const quickSubmit = async () => {
    const r = parse(text, accounts, rules);
    if (!r) { toast('入力を認識できません。「科目 金額 相手科目」の形式で入力してください'); return; }
    try {
      await addJournal({
        date: today(), desc: r.desc,
        lines: [
          { accountId: r.drAcct.id, side: 'dr', amount: r.amount, taxRate: 0 },
          { accountId: r.crAcct.id, side: 'cr', amount: r.amount, taxRate: 0 },
        ],
      });
      setText('');
      toast(`記帳: ${r.drAcct.name} / ${r.crAcct.name} ${fa(r.amount)}`);
    } catch { toast('記帳に失敗しました'); }
  };

  // ── 構造化フォーム（借方/貸方） ──
  const [date, setDate] = useState(today());
  const [desc, setDesc] = useState('');
  const [drId, setDrId] = useState(() => accounts.find((a) => a.type === 'expense')?.id || '');
  const [crId, setCrId] = useState(() => accounts.find((a) => a.type === 'asset')?.id || '');
  const [amount, setAmount] = useState('');
  const [tagId, setTagId] = useState('');

  const clearForm = () => { setDesc(''); setAmount(''); setTagId(''); };
  const submitForm = async () => {
    const amt = Math.round(parseFloat(String(amount).replace(/[¥,，]/g, '')) || 0);
    if (!drId || !crId) { toast('借方・貸方の科目を選んでください'); return; }
    if (amt <= 0) { toast('金額を入力してください'); return; }
    try {
      await addJournal({
        date, desc, ...(tagId ? { tagId } : {}),
        lines: [
          { accountId: drId, side: 'dr', amount: amt, taxRate: 0 },
          { accountId: crId, side: 'cr', amount: amt, taxRate: 0 },
        ],
      });
      clearForm();
      toast('記帳しました');
    } catch { toast('記帳に失敗しました'); }
  };

  // ── かんたんモード（支出/収入/振替・借方貸方を見せず裏で複式に変換）──
  const [mode, setMode] = useState(() => localStorage.getItem('kk_entry_mode') || 'detail');
  const setModeP = (m) => { setMode(m); try { localStorage.setItem('kk_entry_mode', m); } catch {} };
  // ツアーの「今日の支出を記録」ステップから、かんたんモードへ強制切替
  useEffect(() => {
    const h = (e) => setModeP(e.detail);
    window.addEventListener('kk:tour-mode', h);
    return () => window.removeEventListener('kk:tour-mode', h);
  }, []);

  const expenseAccts = useMemo(() => accounts.filter((a) => a.type === 'expense'), [accounts]);
  const incomeAccts = useMemo(() => accounts.filter((a) => a.type === 'income'), [accounts]);
  const assetAccts = useMemo(() => accounts.filter((a) => a.type === 'asset'), [accounts]);
  const payAccts = useMemo(() => accounts.filter((a) => a.type === 'asset' || a.type === 'liability'), [accounts]);

  const [kind, setKind] = useState('out'); // out=支出 / in=収入 / transfer=振替
  const [sDate, setSDate] = useState(today());
  const [sAmt, setSAmt] = useState('');
  const [sDesc, setSDesc] = useState('');
  const [sCat, setSCat] = useState(() => accounts.find((a) => a.type === 'expense')?.id || '');
  const [sPay, setSPay] = useState(() => accounts.find((a) => a.type === 'asset' || a.type === 'liability')?.id || '');
  const [sTo, setSTo] = useState(() => accounts.find((a) => a.type === 'asset')?.id || '');

  const firstId = (list) => list[0]?.id || '';
  const changeKind = (k) => {
    setKind(k);
    if (k === 'out') { setSCat(firstId(expenseAccts)); setSPay(firstId(payAccts)); }
    else if (k === 'in') { setSCat(firstId(incomeAccts)); setSPay(firstId(assetAccts)); }
    else { const from = firstId(payAccts); setSPay(from); setSTo(assetAccts.find((a) => a.id !== from)?.id || firstId(assetAccts)); }
  };

  // かんたん入力 → 借方/貸方を裏で決める（支出:費目/支払元, 収入:入金先/収入, 振替:移動先/移動元）
  const simpleDrCr = () => {
    if (kind === 'out') return { dr: sCat, cr: sPay };
    if (kind === 'in') return { dr: sPay, cr: sCat };
    return { dr: sTo, cr: sPay };
  };
  const submitSimple = async () => {
    const amt = Math.round(parseFloat(String(sAmt).replace(/[¥,，]/g, '')) || 0);
    if (amt <= 0) { toast('金額を入力してください'); return; }
    const { dr, cr } = simpleDrCr();
    if (!dr || !cr) { toast('科目を選んでください'); return; }
    if (dr === cr) { toast('同じ科目どうしは記帳できません'); return; }
    try {
      await addJournal({
        date: sDate, desc: sDesc,
        lines: [
          { accountId: dr, side: 'dr', amount: amt, taxRate: 0 },
          { accountId: cr, side: 'cr', amount: amt, taxRate: 0 },
        ],
      });
      setSAmt(''); setSDesc('');
      toast('記帳しました');
    } catch { toast('記帳に失敗しました'); }
  };

  const SimpleSelect = ({ list, value, onChange }) => (
    <select className="fc" value={value} onChange={(e) => onChange(e.target.value)} style={{ fontSize: 13.5 }}>
      <option value="">選択…</option>
      {list.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
    </select>
  );

  const AcctSelect = ({ value, onChange }) => (
    <select className="fc" value={value} onChange={(e) => onChange(e.target.value)} style={{ fontSize: 13.5 }}>
      <option value="">選択…</option>
      {TYPE_ORDER.map((t) => {
        const opts = accounts.filter((a) => a.type === t);
        if (!opts.length) return null;
        return <optgroup key={t} label={TYPE_LABEL[t]}>{opts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</optgroup>;
      })}
    </select>
  );

  const boxStyle = { border: '1px solid var(--bd)', borderRadius: 14, padding: '16px 18px', background: 'var(--bg3)', display: 'flex', flexDirection: 'column', gap: 8 };
  const sideLabel = { fontSize: 11, fontWeight: 800, letterSpacing: '.1em', marginBottom: 4 };

  return (
    <div className="card" style={{ marginBottom: 16, padding: 0, overflow: 'hidden' }}>
      {/* 一行クイック入力 */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '12px 16px', background: 'var(--bg3)', borderBottom: '1px solid var(--bd)' }}>
        <span style={{ fontSize: 12, color: 'var(--tx3)', whiteSpace: 'nowrap', fontWeight: 600 }}>⚡ 一行で入力</span>
        <input type="text" className="fc" value={text} placeholder="例: 食費 1200 現金 / コンビニ" data-tour="quick-input"
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') quickSubmit(); }}
          style={{ flex: 1, minWidth: 200, padding: '7px 10px', fontSize: 13 }} />
        <button className="btn btn-p btn-s" data-tour="quick-submit" onClick={quickSubmit}>記帳</button>
        {preview && (
          <div style={{ flexBasis: '100%', fontSize: 12 }}>
            <span style={{ color: 'var(--ac)' }}>借方: {preview.drAcct.name}</span>{' / '}
            <span style={{ color: 'var(--red)' }}>貸方: {preview.crAcct.name}</span>{' / '}
            <span className="mono">{fa(preview.amount)}</span>{preview.desc ? ` / ${preview.desc}` : ''}
          </div>
        )}
      </div>

      {/* モード切替 */}
      <div data-tour="entry-mode" style={{ display: 'flex', gap: 6, padding: '10px 16px', borderBottom: '1px solid var(--bd)', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--tx3)', fontWeight: 600 }}>入力方法</span>
        <button className={`btn btn-s ${mode === 'simple' ? 'btn-p' : 'btn-g'}`} onClick={() => setModeP('simple')}>かんたん</button>
        <button className={`btn btn-s ${mode === 'detail' ? 'btn-p' : 'btn-g'}`} onClick={() => setModeP('detail')}>詳細（借方・貸方）</button>
        <span style={{ fontSize: 11, color: 'var(--tx3)' }}>
          {mode === 'simple' ? '簿記の知識がなくてもOK。裏で複式仕訳に変換します' : '借方・貸方を直接入力します'}
        </span>
      </div>

      {/* かんたんフォーム */}
      {mode === 'simple' && (
        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {[['out', '支出'], ['in', '収入'], ['transfer', '振替']].map(([k, label]) => (
              <button key={k} className={`btn btn-s ${kind === k ? 'btn-p' : 'btn-g'}`} style={{ flex: 1 }} onClick={() => changeKind(k)}>{label}</button>
            ))}
          </div>

          <div className="form-row">
            <div className="fg"><label className="fl">日付</label><input type="date" className="fc" value={sDate} onChange={(e) => setSDate(e.target.value)} /></div>
            <div className="fg"><label className="fl">金額</label><input type="text" inputMode="numeric" className="fc" data-tour="simple-amount" value={sAmt} placeholder="0" onChange={(e) => setSAmt(e.target.value)} style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }} /></div>
          </div>

          {kind === 'out' && (
            <div className="form-row">
              <div className="fg"><label className="fl">何に使った？（費目）</label><SimpleSelect list={expenseAccts} value={sCat} onChange={setSCat} /></div>
              <div className="fg"><label className="fl">どこから払った？</label><SimpleSelect list={payAccts} value={sPay} onChange={setSPay} /></div>
            </div>
          )}
          {kind === 'in' && (
            <div className="form-row">
              <div className="fg"><label className="fl">何の収入？</label><SimpleSelect list={incomeAccts} value={sCat} onChange={setSCat} /></div>
              <div className="fg"><label className="fl">どこに入った？</label><SimpleSelect list={assetAccts} value={sPay} onChange={setSPay} /></div>
            </div>
          )}
          {kind === 'transfer' && (
            <div className="form-row">
              <div className="fg"><label className="fl">どこから</label><SimpleSelect list={payAccts} value={sPay} onChange={setSPay} /></div>
              <div className="fg"><label className="fl">どこへ</label><SimpleSelect list={assetAccts} value={sTo} onChange={setSTo} /></div>
            </div>
          )}

          <div className="fg"><label className="fl">メモ（任意）</label><input type="text" className="fc" value={sDesc} placeholder="例）スーパーで食料品" onChange={(e) => setSDesc(e.target.value)} /></div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', borderTop: '1px solid var(--bd)', paddingTop: 12 }}>
            <span style={{ fontSize: 11.5, color: 'var(--tx3)' }}>
              記録される仕訳: <span style={{ color: 'var(--ac)' }}>借方 {accounts.find((a) => a.id === simpleDrCr().dr)?.name || '—'}</span>
              {' / '}
              <span style={{ color: 'var(--red)' }}>貸方 {accounts.find((a) => a.id === simpleDrCr().cr)?.name || '—'}</span>
            </span>
            <button className="btn btn-p" data-tour="simple-submit" onClick={submitSimple}>記帳する</button>
          </div>
        </div>
      )}

      {/* 構造化フォーム（詳細） */}
      {mode === 'detail' && (
      <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="form-row">
          <div className="fg"><label className="fl">日付</label><input type="date" className="fc" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="fg"><label className="fl">摘要</label><input type="text" className="fc" value={desc} placeholder="例）スーパーで食料品を購入" onChange={(e) => setDesc(e.target.value)} /></div>
        </div>

        <div className="je-dc" data-tour="detail-entry">
          <div style={boxStyle}>
            <div style={{ ...sideLabel, color: 'var(--ac)' }}>借方 — DEBIT<InfoTip text="借方(かりかた)は左側＝お金の使い道や増えた財産、貸方(かしかた)は右側＝お金の出どころ。例: 現金で食費を払う→借方:食費／貸方:現金。" /></div>
            <label className="fl">勘定科目</label><AcctSelect value={drId} onChange={setDrId} />
            <label className="fl" style={{ marginTop: 6 }}>金額</label>
            <input type="text" inputMode="numeric" className="fc" data-tour="detail-amount" value={amount} placeholder="0" onChange={(e) => setAmount(e.target.value)} style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }} />
          </div>
          <div className="je-arrow">→</div>
          <div style={boxStyle}>
            <div style={{ ...sideLabel, color: 'var(--red)' }}>貸方 — CREDIT</div>
            <label className="fl">勘定科目</label><AcctSelect value={crId} onChange={setCrId} />
            <label className="fl" style={{ marginTop: 6 }}>金額</label>
            <input type="text" inputMode="numeric" className="fc" value={amount} placeholder="0" onChange={(e) => setAmount(e.target.value)} style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }} />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, borderTop: '1px solid var(--bd)', paddingTop: 14, flexWrap: 'wrap' }}>
          <div data-tour="entry-tags" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--tx2)' }}>タグ</span>
            {tags.length === 0 && <span style={{ fontSize: 12, color: 'var(--tx3)' }}>（未設定）</span>}
            {tags.map((t) => {
              const on = tagId === t.id;
              return (
                <button key={t.id} onClick={() => setTagId(on ? '' : t.id)}
                  style={{ fontSize: 12, padding: '6px 12px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
                    background: on ? 'var(--acb)' : 'var(--bg3)', color: on ? 'var(--ac)' : 'var(--tx2)',
                    border: on ? '1px solid var(--ac)' : '1px solid var(--bd)' }}>
                  {t.name}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-g" onClick={clearForm}>クリア</button>
            <button className="btn btn-p" data-tour="detail-submit" onClick={submitForm}>記帳する</button>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
