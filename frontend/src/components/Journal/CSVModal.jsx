import { useState, useRef, useMemo, useCallback } from 'react';
import { useData } from '../../contexts/DataContext';
import { useToast } from '../Common/Toast';
import { CC, parseCT, normD, pAm, resolveAccount, readCsvFile, detectCsvFormat, normalizeForeignCsv } from '../../utils/csv';
import Modal from '../Common/Modal';

// 明示ルールのみで分類（kakeibo.html の matchRule の優先ルール部分）
function matchRule(rules, desc) {
  if (!desc) return null;
  const d = desc.toLowerCase();
  for (const r of rules) {
    if (r.keyword && d.includes(r.keyword.toLowerCase())) return r;
  }
  return null;
}

export default function CSVModal({ open, onClose }) {
  const { accounts, journals, rules, addJournal } = useData();
  const toast = useToast();
  const fileRef = useRef(null);

  const [rows, setRows] = useState([]);          // パース済みデータ行（フィールド配列の配列）
  const [dupFlags, setDupFlags] = useState([]);  // true = 重複
  const [skip, setSkip] = useState([]);          // true = スキップ
  const [drOverride, setDrOverride] = useState([]); // 行ごとの借方科目ID（select値）
  const [crOverride, setCrOverride] = useState([]);
  const [errors, setErrors] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [hasHeader, setHasHeader] = useState(true); // 1行目をヘッダーとして除外するか
  const [importing, setImporting] = useState(false); // 取込中フラグ（連打防止）
  const [srcFormat, setSrcFormat] = useState('native'); // 'native' | 'mf' | 'zaim'
  const [labelSel, setLabelSel] = useState({});         // 元ラベル(費目/口座名) -> 科目ID（MF/Zaim取込の一括割当）

  const step = rows.length > 0 ? 2 : 1;

  const sortedAccounts = useMemo(
    () => [...accounts].sort((a, b) => (a.code || '').localeCompare(b.code || '')),
    [accounts]
  );

  const reset = useCallback(() => {
    setRows([]); setDupFlags([]); setSkip([]); setDrOverride([]); setCrOverride([]); setErrors([]);
    setSrcFormat('native'); setLabelSel({});
    if (fileRef.current) fileRef.current.value = '';
  }, []);

  const handleClose = () => { reset(); onClose(); };

  // CSV＋ルールから初期の重複/借方/貸方を導出（ingest と「選択をリセット」で共用）
  const deriveInitial = useCallback((parsed) => {
    const ek = new Set();
    journals.forEach((j) => j.lines.forEach((l) => ek.add(`${j.date}|${l.accountId}|${l.amount}`)));

    const dups = parsed.map((r) => {
      const dt = normD(r[CC.d]);
      const dri = resolveAccount(accounts, r[CC.da]);
      const am = pAm(r[CC.dm]) || pAm(r[CC.cm]);
      return !!(dt && dri && am > 0 && ek.has(`${dt}|${dri}|${am}`));
    });
    const dr = parsed.map((r) => {
      const dri = resolveAccount(accounts, r[CC.da]);
      const cri = resolveAccount(accounts, r[CC.ca]);
      if (dri) return dri;
      const rule = (!dri || !cri) ? matchRule(rules, (r[CC.ds] || '').trim()) : null;
      return rule ? rule.drAccountId : '';
    });
    const cr = parsed.map((r) => {
      const dri = resolveAccount(accounts, r[CC.da]);
      const cri = resolveAccount(accounts, r[CC.ca]);
      if (cri) return cri;
      const rule = (!dri || !cri) ? matchRule(rules, (r[CC.ds] || '').trim()) : null;
      return rule ? rule.crAccountId : '';
    });
    return { dups, dr, cr };
  }, [accounts, journals, rules]);

  const ingest = useCallback((parsed) => {
    const { dups, dr, cr } = deriveInitial(parsed);
    setRows(parsed);
    setDupFlags(dups);
    setSkip(dups.slice()); // 重複は初期スキップ
    setDrOverride(dr);
    setCrOverride(cr);
    setErrors([]);
  }, [deriveInitial]);

  // 手動で変更した科目選択・スキップを初期状態（CSV/ルール由来）に戻す
  const clearOverrides = useCallback(() => {
    if (!rows.length) return;
    const { dups, dr, cr } = deriveInitial(rows);
    setDrOverride(dr);
    setCrOverride(cr);
    setSkip(dups.slice());
    setErrors([]);
    toast('科目の選択を初期状態に戻しました');
  }, [rows, deriveInitial, toast]);

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    try {
      const text = await readCsvFile(file);
      const fmt = detectCsvFormat(text);
      setSrcFormat(fmt);
      setLabelSel({});
      const parsed = (fmt === 'mf' || fmt === 'zaim') ? normalizeForeignCsv(text, fmt) : parseCT(text, hasHeader);
      if (!parsed || !parsed.length) { toast('CSVが空、またはデータ行がありません'); return; }
      ingest(parsed);
    } catch { toast('CSVの読み込みに失敗しました'); }
  }, [ingest, toast, hasHeader]);

  const bulkSet = (which, value) => {
    if (!value) return;
    const setter = which === 'dr' ? setDrOverride : setCrOverride;
    setter((prev) => prev.map(() => value));
  };

  const bulkDup = (skipDup) => {
    setSkip((prev) => prev.map((s, i) => dupFlags[i] ? skipDup : s));
  };

  const handleImport = async () => {
    if (importing) return; // 連打・重複取込ガード
    const nj = [], er = [];
    rows.forEach((r, i) => {
      if (skip[i]) return;
      const ln = i + 2;
      const dt = normD(r[CC.d]);
      const da = pAm(r[CC.dm]), ca = pAm(r[CC.cm]);
      const am = da > 0 ? da : ca;
      const ds = (r[CC.ds] || '').trim();
      const dri = drOverride[i] || resolveAccount(accounts, r[CC.da]);
      const cri = crOverride[i] || resolveAccount(accounts, r[CC.ca]);
      if (!dt) { er.push(`行${ln}:日付`); return; }
      if (!dri) { er.push(`行${ln}:借方`); return; }
      if (!cri) { er.push(`行${ln}:貸方`); return; }
      if (am <= 0) { er.push(`行${ln}:金額`); return; }
      nj.push({ date: dt, desc: ds, lines: [
        { accountId: dri, side: 'dr', amount: am, taxRate: 0 },
        { accountId: cri, side: 'cr', amount: am, taxRate: 0 },
      ] });
    });

    if (er.length) setErrors(er);
    if (!nj.length) { if (er.length) toast('取込可能な行がありません'); return; }
    setImporting(true);
    try {
      for (const j of nj) await addJournal(j);
      toast(`${nj.length}件追加、${er.length}件エラー`);
      handleClose();
    } catch { toast('取込に失敗しました'); }
    finally { setImporting(false); }
  };

  const dupCount = dupFlags.filter(Boolean).length;
  const willImport = rows.length ? skip.filter((s) => !s).length : 0;
  const ruleCount = useMemo(() => rows.filter((r) => {
    const dri = resolveAccount(accounts, r[CC.da]);
    const cri = resolveAccount(accounts, r[CC.ca]);
    return (!dri || !cri) && matchRule(rules, (r[CC.ds] || '').trim());
  }).length, [rows, accounts, rules]);

  // MF/Zaim取込: 自動一致しなかった元ラベル（費目・口座名）の一覧（出現回数つき・多い順）
  const foreignLabels = useMemo(() => {
    if (srcFormat === 'native' || !rows.length) return [];
    const counts = {};
    rows.forEach((r) => {
      [r[CC.da], r[CC.ca]].forEach((nm) => {
        const s = (nm || '').trim();
        if (!s || resolveAccount(accounts, s)) return; // 空・自動一致は除外
        counts[s] = (counts[s] || 0) + 1;
      });
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, count }));
  }, [rows, accounts, srcFormat]);

  // 元ラベルを科目に割当 → 同じラベルの行すべての借方/貸方上書きに反映
  const assignLabel = (label, id) => {
    setLabelSel((p) => ({ ...p, [label]: id }));
    setDrOverride((prev) => prev.map((v, i) => ((rows[i][CC.da] || '').trim() === label ? id : v)));
    setCrOverride((prev) => prev.map((v, i) => ((rows[i][CC.ca] || '').trim() === label ? id : v)));
  };

  return (
    <Modal open={open} onClose={handleClose} title="CSV取込" wide
      footer={step === 2 ? <>
        <button className="btn btn-g" onClick={reset} disabled={importing}>← 戻る</button>
        <button className="btn btn-p" onClick={handleImport} disabled={importing || willImport === 0}>{importing ? '取込中…' : `取込実行（${willImport}件）`}</button>
      </> : null}>

      {step === 1 ? (
        <div>
          <div className="info-b mb-10">
            <div>マネーフォワード / Zaim のCSVは<strong>自動で判定して取り込みます</strong>（費目・口座は次の画面で科目に割り当て）。</div>
            <div style={{ marginTop: 4 }}>独自フォーマットのカラム: <code>日付,借方科目,借方金額,貸方科目,貸方金額,摘要</code></div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} />
            1行目はヘッダー行（列名）として読み飛ばす
            <span style={{ fontSize: 11, color: 'var(--tx3)' }}>
              ※ヘッダーが無いCSVはチェックを外してください
            </span>
          </label>
          <div className={`csv-drop ${dragOver ? 'dragover' : ''}`}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}>
            <p>クリックまたはドラッグ＆ドロップ</p>
          </div>
          {/* 同じファイルを選び直しても onChange が発火するよう value をクリア（失敗後の再選択対策） */}
          <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; handleFile(f); }} />
        </div>
      ) : (
        <div>
          {srcFormat !== 'native' && (
            <div className="csv-map" style={{ background: 'var(--acb)', border: '1px solid var(--ac)', borderRadius: 6, padding: '12px 14px', marginBottom: 12 }}>
              <div style={{ fontSize: 12.5, color: 'var(--tx)', fontWeight: 600, marginBottom: foreignLabels.length ? 8 : 0 }}>
                「{srcFormat === 'mf' ? 'マネーフォワード' : 'Zaim'}」形式を検出しました。
                {foreignLabels.length > 0
                  ? '元の費目・口座を本アプリの科目に割り当ててください（同じ名前の行すべてに反映されます）。'
                  : 'すべての科目が自動で割り当てられました。'}
              </div>
              {foreignLabels.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 6 }}>
                  {foreignLabels.map(({ label, count }) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 11.5, color: 'var(--tx2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={label}>
                        {label} <span style={{ color: 'var(--tx3)' }}>({count})</span>
                      </span>
                      <select className="csv-sel" style={{ width: 134, minWidth: 134 }} value={labelSel[label] || ''} onChange={(e) => assignLabel(label, e.target.value)}>
                        <option value="">（割当先）</option>
                        {sortedAccounts.map((a) => <option key={a.id} value={a.id}>{a.code ? `${a.code} ` : ''}{a.name}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--tx2)', flex: 1 }}>
              {rows.length}行 (重複{dupCount}件{ruleCount ? `, ルール適用${ruleCount}件` : ''})
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ fontSize: 11, color: 'var(--tx3)' }}>借方:</span>
              <select className="fc" style={{ width: 150, padding: 5, fontSize: 12 }} defaultValue="" onChange={(e) => bulkSet('dr', e.target.value)}>
                <option value="">—</option>
                {sortedAccounts.map((a) => <option key={a.id} value={a.id}>{a.code ? `${a.code} ` : ''}{a.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ fontSize: 11, color: 'var(--tx3)' }}>貸方:</span>
              <select className="fc" style={{ width: 150, padding: 5, fontSize: 12 }} defaultValue="" onChange={(e) => bulkSet('cr', e.target.value)}>
                <option value="">—</option>
                {sortedAccounts.map((a) => <option key={a.id} value={a.id}>{a.code ? `${a.code} ` : ''}{a.name}</option>)}
              </select>
            </div>
            <button className="btn btn-g btn-s" onClick={() => bulkDup(true)}>重複を一括スキップ</button>
            <button className="btn btn-g btn-s" onClick={() => bulkDup(false)}>重複を一括取込</button>
            <button className="btn btn-d btn-s" onClick={clearOverrides} title="手動で変えた科目・スキップを初期状態に戻す">選択をリセット</button>
          </div>

          <div className="csv-pw">
            <table>
              <thead><tr>
                <th /><th>日付</th><th>借方</th><th>金額</th><th>貸方</th><th>金額</th><th>摘要</th>
                <th>借方(上書)</th><th>貸方(上書)</th><th>状態</th>
              </tr></thead>
              <tbody>
                {rows.map((r, i) => {
                  const dt = normD(r[CC.d]);
                  const dri = resolveAccount(accounts, r[CC.da]);
                  const cri = resolveAccount(accounts, r[CC.ca]);
                  const da = pAm(r[CC.dm]), ca = pAm(r[CC.cm]);
                  const am = da > 0 ? da : ca;
                  const isDup = dupFlags[i];
                  const desc = (r[CC.ds] || '').trim();
                  const rule = (!dri || !cri) ? matchRule(rules, desc) : null;
                  const warn = [];
                  if (!dt) warn.push('日付');
                  if (am <= 0) warn.push('金額');
                  const statusTxt = isDup ? '⚠重複' : rule && (!dri || !cri) ? '🤖ルール適用' : warn.length ? warn.join(' ') : 'OK';
                  const statusColor = isDup ? 'var(--ac)' : rule && (!dri || !cri) ? 'var(--blu)' : warn.length ? 'var(--red)' : 'var(--grn)';
                  return (
                    <tr key={i} className={isDup ? 'csv-dup-row' : ''}>
                      <td><input type="checkbox" checked={!!skip[i]} title="スキップ"
                        onChange={(e) => setSkip((prev) => prev.map((s, idx) => idx === i ? e.target.checked : s))} /></td>
                      <td className="mono" style={{ whiteSpace: 'nowrap' }}>{r[CC.d] || ''}</td>
                      <td style={{ color: dri ? 'var(--tx2)' : 'var(--red)' }}>{r[CC.da] || ''}</td>
                      <td className="mono text-r">{r[CC.dm] || ''}</td>
                      <td style={{ color: cri ? 'var(--tx2)' : 'var(--red)' }}>{r[CC.ca] || ''}</td>
                      <td className="mono text-r">{r[CC.cm] || ''}</td>
                      <td>{desc}</td>
                      <td>
                        <select className="csv-sel" value={drOverride[i] || ''}
                          onChange={(e) => setDrOverride((prev) => prev.map((v, idx) => idx === i ? e.target.value : v))}>
                          <option value="">(CSV)</option>
                          {sortedAccounts.map((a) => <option key={a.id} value={a.id}>{a.code ? `${a.code} ` : ''}{a.name}</option>)}
                        </select>
                      </td>
                      <td>
                        <select className="csv-sel" value={crOverride[i] || ''}
                          onChange={(e) => setCrOverride((prev) => prev.map((v, idx) => idx === i ? e.target.value : v))}>
                          <option value="">(CSV)</option>
                          {sortedAccounts.map((a) => <option key={a.id} value={a.id}>{a.code ? `${a.code} ` : ''}{a.name}</option>)}
                        </select>
                      </td>
                      <td style={{ fontSize: 10, color: statusColor }}>{statusTxt}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {errors.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--red)', maxHeight: 60, overflowY: 'auto' }}>
              {errors.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
