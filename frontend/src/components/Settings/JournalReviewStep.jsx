import { useEffect, useMemo, useState } from 'react';
import { sortRows, newLine } from '../../utils/migrate/review';

// 移行の「仕訳明細」。取り込む仕訳を1行ずつ並べ、日付・借方か貸方か・科目・金額を直し、行を足したり消したりできる。
// 貸借が合わないなど取り込めない仕訳は赤くして、直すまで取り込まない。仕訳の作り方は utils/migrate/review.js。

const PAGE = 100; // 1ページの行数（数千行を一度に並べると入力欄が重くなるため）
const hint = { fontSize: 11.5, color: 'var(--tx3)' };
const ORDERS = { file: 'ファイルの順', date: '日付の順', account: '科目の順' };

export default function JournalReviewStep({ groups, setGroups, checks, dupNos, includeDups, setIncludeDups, dupRef, acctOptions, acctKey, unit, jumpReq }) {
  const [order, setOrder] = useState('file');
  const [page, setPage] = useState(0);
  const [focus, setFocus] = useState(null); // { uid, n }（同じ行へもう一度送るときも動くよう n を増やす）

  const rows = useMemo(() => sortRows(groups, order, acctKey), [groups, order, acctKey]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const view = rows.slice(cur * PAGE, (cur + 1) * PAGE);

  const counts = useMemo(() => {
    let ok = 0, bad = 0, dup = 0;
    for (const g of groups) {
      if (!g.lines.length) continue;
      if (!checks.get(g.no).ok) bad++;
      else if (dupNos.has(g.no)) dup++;
      else ok++;
    }
    return { ok, bad, dup };
  }, [groups, checks, dupNos]);

  const updateGroup = (no, fn) => setGroups((gs) => gs.map((g) => (g.no === no ? fn(g) : g)));
  const updateLine = (no, uid, patch) => updateGroup(no, (g) => ({ ...g, lines: g.lines.map((l) => (l.uid === uid ? { ...l, ...patch } : l)) }));
  const addLine = (no, uid) => updateGroup(no, (g) => {
    const i = g.lines.findIndex((l) => l.uid === uid);
    return { ...g, lines: [...g.lines.slice(0, i + 1), newLine(g), ...g.lines.slice(i + 1)] };
  });
  const removeLine = (no, uid) => updateGroup(no, (g) => ({ ...g, lines: g.lines.filter((l) => l.uid !== uid) }));

  // 今の並びで、次に直す必要がある仕訳へ（ページもめくる）
  const jumpBad = () => {
    const at = focus ? rows.findIndex((r) => r.l.uid === focus.uid) : -1;
    const bad = rows.map((r, i) => (checks.get(r.g.no).ok ? -1 : i)).filter((i) => i >= 0);
    if (!bad.length) return;
    // 同じ仕訳の続きの行は飛ばして、次の仕訳の先頭へ
    const next = bad.find((i) => i > at && (at < 0 || rows[i].g.no !== rows[at].g.no)) ?? bad[0];
    setPage(Math.floor(next / PAGE));
    setFocus((f) => ({ uid: rows[next].l.uid, n: (f?.n || 0) + 1 }));
  };
  useEffect(() => { if (jumpReq) jumpBad(); }, [jumpReq]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!focus) return;
    document.querySelector(`[data-uid="${focus.uid}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focus]);

  const acctSelect = (g, l) => (
    <select className="csv-sel" value={l.acct} onChange={(e) => updateLine(g.no, l.uid, { acct: e.target.value })}
      style={{ minWidth: 210, ...(l.acct ? {} : { borderColor: 'var(--red)' }) }}>
      <option value="">（科目を選ぶ）</option>
      <optgroup label="ファイルの科目（科目のマッピングのとおり）">
        {acctOptions.pairs.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </optgroup>
      <optgroup label="くろふくぼの科目">
        {acctOptions.accounts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </optgroup>
    </select>
  );

  const status = (g) => {
    const c = checks.get(g.no);
    if (!c.ok) return <span style={{ color: 'var(--red)' }}>{c.reason}</span>;
    if (dupNos.has(g.no)) return <span style={{ color: 'var(--tx3)' }}>取込済みと同じ{includeDups ? '' : '（取り込みません）'}</span>;
    return <span style={{ color: 'var(--grn)' }}>取り込めます</span>;
  };

  return (
    <div>
      <div style={{ fontSize: 13, lineHeight: 1.9 }}>
        仕訳 <strong>{(counts.ok + counts.bad + counts.dup).toLocaleString()}</strong> 件：取り込める {counts.ok.toLocaleString()} 件
        {counts.bad > 0 && <span style={{ color: 'var(--red)' }}>・直す必要がある {counts.bad.toLocaleString()} 件</span>}
        {counts.dup > 0 && <span>・取込済みと同じ {counts.dup.toLocaleString()} 件</span>}
        {counts.bad > 0 && <button type="button" className="btn btn-g btn-s" style={{ marginLeft: 8 }} onClick={jumpBad}>直す仕訳へ</button>}
      </div>
      {counts.dup > 0 && (
        <label ref={dupRef} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--tx2)' }}>
          <input type="checkbox" checked={includeDups} onChange={(e) => setIncludeDups(e.target.checked)} />
          取込済みと同じ仕訳も取り込む（既定では外します）
        </label>
      )}
      <div style={{ ...hint, margin: '4px 0 8px' }}>
        行ごとに日付・借方か貸方か・科目・金額を直せます。「＋」で行を足すと、借方と貸方の差額が入ります。赤い仕訳は、直すまで取り込みません。
        マッピングの画面に戻って列を変えると、ここで直した内容は消えます。
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12.5 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          並び順
          <select className="csv-sel" style={{ width: 'auto', minWidth: 120 }} value={order} onChange={(e) => { setOrder(e.target.value); setPage(0); }}>
            {Object.entries(ORDERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        {pages > 1 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
            <button type="button" className="btn btn-g btn-s" disabled={cur === 0} onClick={() => setPage(cur - 1)}>前へ</button>
            {cur + 1} / {pages} ページ
            <button type="button" className="btn btn-g btn-s" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>次へ</button>
          </span>
        )}
      </div>

      {/* 高さを抑えるとモーダルの中でさらにスクロールが入るので、ここでは抑えない */}
      <div className="csv-pw" style={{ maxHeight: 'none' }}>
        <table>
          <thead>
            <tr><th>仕訳</th><th>日付</th><th>借方／貸方</th><th>科目</th><th className="text-r">金額</th><th>摘要</th><th /></tr>
          </thead>
          <tbody>
            {view.map(({ g, l }, i) => {
              // 同じ仕訳が続く行では、仕訳の番号・状態・日付・摘要を先頭の行にだけ出す
              const first = i === 0 || view[i - 1].g !== g;
              const bad = !checks.get(g.no).ok;
              return (
                <tr key={l.uid} data-uid={l.uid} style={{
                  ...(bad ? { background: 'rgba(208,96,96,.07)' } : {}),
                  ...(first ? {} : { borderTop: 'none' }),
                  ...(focus?.uid === l.uid ? { outline: '2px solid var(--ac)', outlineOffset: -2 } : {}),
                }}>
                  <td style={{ fontSize: 11.5, minWidth: 120, verticalAlign: 'top' }}>
                    {first && <>
                      <div className="mono" style={{ color: 'var(--tx2)' }}>#{g.no}<span style={{ color: 'var(--tx3)', marginLeft: 6 }}>{unit === '件目' ? `${g.rowNos.join(', ')} 件目` : `行 ${g.rowNos.join(', ')}`}</span></div>
                      <div>{status(g)}</div>
                    </>}
                  </td>
                  <td>
                    {first && <input type="date" className="csv-sel" style={{ width: 140, minWidth: 130 }} value={g.date}
                      onChange={(e) => updateGroup(g.no, (x) => ({ ...x, date: e.target.value }))} />}
                  </td>
                  <td>
                    <select className="csv-sel" style={{ width: 84, minWidth: 80, ...(l.side ? {} : { borderColor: 'var(--red)' }) }} value={l.side}
                      onChange={(e) => updateLine(g.no, l.uid, { side: e.target.value })}>
                      <option value="">（選ぶ）</option>
                      <option value="dr">借方</option>
                      <option value="cr">貸方</option>
                    </select>
                  </td>
                  <td>{acctSelect(g, l)}</td>
                  <td>
                    <input className="csv-sel mono" type="number" min="0" step="any" style={{ width: 100, minWidth: 90, textAlign: 'right', ...(l.amount > 0 ? {} : { borderColor: 'var(--red)' }) }}
                      value={l.amount || ''} onChange={(e) => updateLine(g.no, l.uid, { amount: Math.max(0, Number(e.target.value) || 0) })} />
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--tx2)', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={g.desc}>{first && g.desc}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button type="button" className="btn btn-g btn-s" title="この仕訳に行を足す" onClick={() => addLine(g.no, l.uid)}>＋</button>
                    <button type="button" className="btn btn-g btn-s" style={{ marginLeft: 4 }} title="この行を消す" onClick={() => removeLine(g.no, l.uid)}>消す</button>
                  </td>
                </tr>
              );
            })}
            {!view.length && <tr><td colSpan={7} style={{ color: 'var(--tx3)' }}>取り込む仕訳がありません</td></tr>}
          </tbody>
        </table>
      </div>
      {order === 'account' && <div style={{ ...hint, marginTop: 6 }}>科目の順では、同じ仕訳の行が離れて並びます。「#番号」が同じ行が1つの仕訳です。</div>}
    </div>
  );
}
