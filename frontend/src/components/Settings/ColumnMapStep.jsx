import { Fragment, useMemo } from 'react';
import { SHAPES, distinctValues, deriveModes } from '../../utils/migrate/mapping';

// 移行の「列のマッピング」。左に元のファイルの列、右にくろふくぼの項目を並べ、列ごとに何として読むかを選ぶ。
// 変えるたびに先頭の数件を仕訳にした見本を出す。
// 対応付けのデータ（utils/migrate/mapping.js の emptyMapping）は「項目 → 列の配列」なので、画面では列の側から引き直す。

const hint = { fontSize: 11.5, color: 'var(--tx3)' };
const box = { border: '1px solid var(--bd)', borderRadius: 8, padding: '10px 12px', marginBottom: 12 };

// 右のプルダウンに出す項目（元データの形ごと）
const ITEMS = {
  single: [
    ['date', '日付'], ['amount', '金額'], ['inCol', '入金額'], ['outCol', '出金額'], ['flowCol', '収支区分（支出・収入・振替）'],
    ['accountCol', '口座'], ['fromCol', '出金元の口座'], ['toCol', '入金先の口座'], ['toAccount', '振替先の口座'],
    ['category', 'カテゴリ'], ['subCategory', '補助カテゴリ'], ['memo', '摘要（メモ）'], ['rowNo', '行番号'],
  ],
  lines: [
    ['date', '日付'], ['account', '科目'], ['sub', '補助科目'], ['code', '科目コード'], ['subCode', '補助科目コード'],
    ['amount', '金額'], ['sideCol', '貸借（借方か貸方か）'], ['memo', '摘要（メモ）'], ['voucher', '仕訳No'], ['rowNo', '行番号'],
  ],
  pair: [
    ['date', '日付'],
    ['drAccount', '借方科目'], ['drSub', '借方補助科目'], ['drCode', '借方科目コード'], ['drSubCode', '借方補助科目コード'], ['drAmount', '借方金額'],
    ['crAccount', '貸方科目'], ['crSub', '貸方補助科目'], ['crCode', '貸方科目コード'], ['crSubCode', '貸方補助科目コード'], ['crAmount', '貸方金額'],
    ['memo', '摘要（メモ）'], ['voucher', '仕訳No'], ['rowNo', '行番号'],
  ],
};
// 列を付け替えるときは、前の形の項目も含めてすべてから外す
const ALL_FIELDS = [...new Set(Object.values(ITEMS).flat().map(([f]) => f))];

// 貸借・収支の決め方（どの項目に列を選んだかで決まる。mapping.js の deriveModes）
function modeNote(m) {
  if (m.shape === 'lines') {
    return m.sideMode === 'column' ? '借方か貸方かは「貸借」の列の値で決めます。' : '「貸借」の列を選ばないときは、金額の符号で決めます（プラス＝借方・マイナス＝貸方）。';
  }
  if (m.shape === 'pair') return '貸方金額を選ばないときは、借方金額と同じにします。';
  return {
    sign: '収支は金額の符号で決めます（マイナス＝支出・プラス＝収入）。',
    column: '収支は「収支区分」の列の値で決めます。',
    inout: '入金額に金額があれば収入、出金額にあれば支出にします。',
    fromto: '出金元の口座だけなら支出、入金先の口座だけなら収入、両方あれば振替にします。',
  }[m.flowMode];
}

export default function ColumnMapStep({ table, mapping, onChange, preview }) {
  const m = mapping;
  const set = (patch) => onChange(deriveModes({ ...m, ...patch }));
  const items = ITEMS[m.shape];

  // 列ごとに最初の値を見本として添える（見出しの無い CSV で「列4」が何か分かるように）
  const samples = useMemo(() => table.columns.map((_, i) => {
    const r = table.rows.find((row) => (row.cells[i] || '').trim());
    const v = r ? r.cells[i].trim() : '';
    return v.length > 14 ? v.slice(0, 14) + '…' : v;
  }), [table]);

  const fieldOf = (c) => (items.find(([f]) => (m[f] || []).includes(c)) || [''])[0];
  const assignColumn = (c, field) => {
    const patch = {};
    for (const f of ALL_FIELDS) if ((m[f] || []).includes(c)) patch[f] = m[f].filter((x) => x !== c);
    if (field) patch[field] = [...(patch[field] || m[field] || []), c];
    set(patch);
  };

  // 貸借・収支区分の列の値ごとに意味を割り当てる（その列の行の下に出す）
  const valueMap = (field, values, options, dflt) => {
    const found = distinctValues(table, m[field]);
    if (!found.length) return null;
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', alignItems: 'center' }}>
        {found.map((v) => (
          <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            「{v || '（空）'}」→
            <select className="csv-sel" style={{ width: 'auto', minWidth: 90 }} value={(m[values] || {})[v] || dflt}
              onChange={(e) => set({ [values]: { ...m[values], [v]: e.target.value || undefined } })}>
              {options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
        ))}
      </div>
    );
  };
  const valueRow = (c) => {
    if (m.shape === 'lines' && c === (m.sideCol || [])[0]) return valueMap('sideCol', 'sideValues', [['', '読まない'], ['dr', '借方'], ['cr', '貸方']], '');
    if (m.shape === 'single' && c === (m.flowCol || [])[0]) return valueMap('flowCol', 'flowValues', [['expense', '支出'], ['income', '収入'], ['transfer', '振替']], 'expense');
    return null;
  };

  const setRule = (i, patch) => set({ exclude: m.exclude.map((r, k) => (k === i ? { ...r, ...patch } : r)) });

  return (
    <div>
      <div style={box}>
        <div className="fl" style={{ marginBottom: 6 }}>元データの形</div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13 }}>
          {Object.entries(SHAPES).map(([k, l]) => (
            <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="radio" name="mig-shape" checked={m.shape === k} onChange={() => set({ shape: k })} />{l}
            </label>
          ))}
        </div>
        <div style={{ ...hint, marginTop: 6 }}>
          {m.shape === 'single' && '1行が1つの取引（収入・支出・振替）。支出は「カテゴリ／口座」、収入は「口座／カテゴリ」の仕訳に組み替えます。'}
          {m.shape === 'lines' && '1行が仕訳の借方か貸方の一方。借方と貸方の合計が合うまで続きの行を1つの仕訳にまとめます。'}
          {m.shape === 'pair' && '1行に借方と貸方が並ぶ形。片方だけの行（複合仕訳の続き）は、合計が合うまで1つの仕訳にまとめます。'}
        </div>
      </div>

      <div style={hint}>
        元のファイルの列ごとに、くろふくぼのどの項目として読むかを選びます。使わない列は「使わない」のままにします。
        同じ項目に2つ以上の列を選ぶと、値のある最初の列を使います。
      </div>
      {/* 高さを抑えるとモーダルの中でさらにスクロールが入るので、ここでは抑えない */}
      <div className="csv-pw" style={{ marginTop: 6, maxHeight: 'none' }}>
        <table>
          <thead><tr><th>元のファイルの列</th><th /><th>くろふくぼの項目</th></tr></thead>
          <tbody>
            {table.columns.map((c, i) => {
              const f = fieldOf(c);
              const sub = f && valueRow(c);
              return (
                <Fragment key={c}>
                  <tr>
                    <td style={{ width: '45%' }}>{c}{samples[i] && <span style={{ color: 'var(--tx3)', marginLeft: 6 }}>（{samples[i]}）</span>}</td>
                    <td style={{ color: 'var(--tx3)', width: 16 }}>→</td>
                    <td>
                      <select className="csv-sel" value={f} onChange={(e) => assignColumn(c, e.target.value)} style={{ maxWidth: 280, ...(f ? {} : { color: 'var(--tx3)' }) }}>
                        <option value="">使わない</option>
                        {items.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </select>
                    </td>
                  </tr>
                  {sub && <tr><td colSpan={3} style={{ paddingLeft: 24, fontSize: 12 }}>{sub}</td></tr>}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ ...hint, marginTop: 6 }}>{modeNote(m)}</div>
      {m.shape === 'single' && m.flowMode !== 'fromto' && !(m.accountCol || []).length && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12.5, marginTop: 8 }}>
          口座の列が無いときは、すべてこの口座にする
          <input className="csv-sel" style={{ width: 160 }} value={m.fixedAccount} placeholder="例：現金"
            onChange={(e) => set({ fixedAccount: e.target.value })} />
        </label>
      )}

      <div style={{ ...box, marginTop: 12 }}>
        <div className="fl" style={{ marginBottom: 2 }}>取り込まない行</div>
        <div style={{ ...hint, marginBottom: 8 }}>
          次の条件に当てはまる行は、取り込まずに読み飛ばします。金額が0の行も読み飛ばします。読み飛ばした行の数は、下の「科目のマッピング」に出ます。
        </div>
        {m.exclude.map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap', fontSize: 12.5 }}>
            {/* 決まった対応付けの条件は文で出す。自分で足した条件は列と値を選ぶ */}
            {r.label ? (
              <span>
                <strong>{(r.col || [])[0]}</strong> の列が
                {r.notIn ? `${r.notIn.map((v) => (v ? `「${v}」` : '空')).join('でも')}でもない` : `${(r.values || []).map((v) => `「${v}」`).join('か')}の`}行
                <span style={{ color: 'var(--tx3)' }}>（{r.label}）</span>
              </span>
            ) : <>
              <select className="csv-sel" style={{ width: 200 }} value={(r.col || [])[0] || ''} onChange={(e) => setRule(i, { col: e.target.value ? [e.target.value] : [] })}>
                <option value="">（列を選ぶ）</option>
                {table.columns.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <span>の列が</span>
              <input className="csv-sel" style={{ width: 120, minWidth: 80 }} value={(r.values || []).join('、')} placeholder="値"
                onChange={(e) => setRule(i, { values: e.target.value.split(/[、,]/).map((v) => v.trim()) })} />
              <span>の行</span>
              <span style={hint}>（値は「、」で区切ると2つ以上）</span>
            </>}
            <button type="button" className="btn btn-g btn-s" onClick={() => set({ exclude: m.exclude.filter((_, k) => k !== i) })}>外す</button>
          </div>
        ))}
        <button type="button" className="btn btn-g btn-s" onClick={() => set({ exclude: [...m.exclude, { col: [], values: [''], label: '' }] })}>＋ 条件を足す</button>
      </div>

      <div className="fl" style={{ marginBottom: 4 }}>見本（先頭 5 件）</div>
      <div className="csv-pw" style={{ marginTop: 0 }}>
        <table>
          <thead><tr><th>日付</th><th>借方</th><th>貸方</th><th className="text-r">金額</th><th>摘要</th></tr></thead>
          <tbody>
            {preview.journals.slice(0, 5).map((j, i) => {
              const side = (s) => j.lines.filter((l) => l.side === s).map((l) => `${l.name}${l.subName ? '／' + l.subName : ''}`).join('、');
              return (
                <tr key={i}>
                  <td className="mono" style={{ whiteSpace: 'nowrap' }}>{j.date}</td>
                  <td>{side('dr')}</td>
                  <td>{side('cr')}</td>
                  <td className="mono text-r">{j.lines.filter((l) => l.side === 'dr').reduce((s, l) => s + l.amount, 0).toLocaleString()}</td>
                  <td>{j.desc}</td>
                </tr>
              );
            })}
            {!preview.journals.length && <tr><td colSpan={5} style={{ color: 'var(--tx3)' }}>仕訳にできる行がありません</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
