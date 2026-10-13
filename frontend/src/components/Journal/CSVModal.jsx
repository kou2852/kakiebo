import { useState, useRef, useMemo, useCallback } from 'react';
import { useData } from '../../contexts/DataContext';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../Common/Toast';
import { CC, normD, pAm, csvAmount, resolveAccount, readCsvFile, detectCsvFormat, normalizeForeignCsv } from '../../utils/csv';
import Modal from '../Common/Modal';
import {
  COLUMN_ROLES, applyRoles, guessRoles, loadCsvPresets, looksHeaderless,
  matchPreset, missingRoles, presetSig, rawRows, saveCsvPresets, skippedRows,
} from '../../utils/csvMapping';
import { uid } from '../../utils/format';

// 明示ルールのみで分類（kakeibo.html の matchRule の優先ルール部分）
function matchRule(rules, desc) {
  if (!desc) return null;
  const d = desc.toLowerCase();
  for (const r of rules) {
    if (r.keyword && d.includes(r.keyword.toLowerCase())) return r;
  }
  return null;
}

export default function CSVModal({ open, onClose, onMigrate }) {
  const { accounts, journals, rules, addJournal } = useData();
  const { guestMode } = useAuth();
  const toast = useToast();
  const fileRef = useRef(null);

  const [rows, setRows] = useState([]);          // パース済みデータ行（フィールド配列の配列）
  const [dupFlags, setDupFlags] = useState([]);  // true = 重複
  const [skip, setSkip] = useState([]);          // true = スキップ
  const [drOverride, setDrOverride] = useState([]); // 行ごとの借方科目ID（select値）
  const [crOverride, setCrOverride] = useState([]);
  const [errors, setErrors] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState(false); // 取込中フラグ（連打防止）
  const [srcFormat, setSrcFormat] = useState('native'); // 'native' | 'mf' | 'zaim' | 'mapped'（列の割り当てで読んだもの）
  const [labelSel, setLabelSel] = useState({});         // 元ラベル(費目/口座名) -> 科目ID（MF/Zaim取込の一括割当）
  // カード会社・銀行の明細など、本アプリ形式でも MF/Zaim でもない CSV の列の割り当て（csvMapping.js）。
  // CSV の行はそのまま表にし、列ごとに役割を選んでもらう。
  // { raw: 全行, firstIsHeader, cols, roles: [列ごとの役割], sign, expenseId, accountId, incomeId, presetId, saveName }
  const [mapping, setMapping] = useState(null);
  const [csvPresets, setCsvPresets] = useState(() => loadCsvPresets());

  // 保存した割り当ての管理（名前・列の項目・科目の編集と削除）。どの段からでも開いて、閉じると元の段へ戻る
  const [managing, setManaging] = useState(false);
  const step = managing ? 'presets' : rows.length > 0 ? 2 : mapping ? 'map' : 1;

  // 手で選ぶプルダウン用。非表示の科目は出さない（csv.js の自動一致は非表示も対象のまま）
  const sortedAccounts = useMemo(
    () => accounts.filter((a) => !a.hidden).sort((a, b) => (a.code || '').localeCompare(b.code || '')),
    [accounts]
  );

  const reset = useCallback(() => {
    setRows([]); setDupFlags([]); setSkip([]); setDrOverride([]); setCrOverride([]); setErrors([]);
    setSrcFormat('native'); setLabelSel({}); setMapping(null); setManaging(false);
    if (fileRef.current) fileRef.current.value = '';
  }, []);

  const handleClose = () => { reset(); onClose(); };

  // CSV＋ルールから初期の重複/借方/貸方を導出（ingest と「選択をリセット」で共用）
  // defaults: 列の割り当てで読んだときの、科目が決まらない行に使う科目 { expense, account, income }。
  //   支出の行は 費目 ← 口座・カード、入金の行（中間形式の7列目が 'in'）は 口座・カード ← 入金の科目。ルールが当たればそちらが先
  const deriveInitial = useCallback((parsed, defaults = null) => {
    const defDr = (r) => (r[6] === 'in' ? defaults?.account : defaults?.expense) || '';
    const defCr = (r) => (r[6] === 'in' ? defaults?.income : defaults?.account) || '';
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
      return rule ? rule.drAccountId : defDr(r);
    });
    const cr = parsed.map((r) => {
      const dri = resolveAccount(accounts, r[CC.da]);
      const cri = resolveAccount(accounts, r[CC.ca]);
      if (cri) return cri;
      const rule = (!dri || !cri) ? matchRule(rules, (r[CC.ds] || '').trim()) : null;
      return rule ? rule.crAccountId : defCr(r);
    });
    return { dups, dr, cr };
  }, [accounts, journals, rules]);

  const [ingestDefaults, setIngestDefaults] = useState(null);
  const ingest = useCallback((parsed, defaults = null) => {
    setIngestDefaults(defaults);
    const { dups, dr, cr } = deriveInitial(parsed, defaults);
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
    const { dups, dr, cr } = deriveInitial(rows, ingestDefaults);
    setDrOverride(dr);
    setCrOverride(cr);
    setSkip(dups.slice());
    setErrors([]);
    toast('科目の選択を初期状態に戻しました');
  }, [rows, deriveInitial, toast, ingestDefaults]);

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    try {
      const text = await readCsvFile(file);
      const fmt = detectCsvFormat(text);
      setSrcFormat(fmt);
      setLabelSel({});
      if (fmt === 'native') {
        // マネーフォワード / Zaim 以外は、本アプリの書き出しも含めて列の割り当てへ進む。
        // 本アプリの書き出しは、見出しから列を埋めておく（guessRoles）
        const raw = rawRows(text);
        const headerless = looksHeaderless(raw);
        if (raw.length < (headerless ? 1 : 2)) { toast('CSVが空、またはデータ行がありません'); return; }
        const header = headerless ? [] : raw[0];
        const data = headerless ? raw : raw.slice(1);
        // 列の数は一番長い行に合わせる（途中で列が増える CSV もある）
        const cols = Math.max(...raw.map((r) => r.length));
        // 同じ形式で保存した割り当てがあれば、それを使う。無ければ見出し（無ければ中身）から推測する
        const preset = matchPreset(csvPresets, header, headerless, cols);
        const roles = preset?.roles?.length === cols ? preset.roles : guessRoles(header, data, headerless, cols);
        setMapping({
          raw, firstIsHeader: !headerless, cols, roles,
          sign: preset?.sign || 'positive',
          expenseId: preset?.expenseId || '', accountId: preset?.accountId || '', incomeId: preset?.incomeId || '',
          presetId: preset?.id || '', saveName: '',
        });
        return;
      }
      const parsed = normalizeForeignCsv(text, fmt);
      if (!parsed || !parsed.length) { toast('CSVが空、またはデータ行がありません'); return; }
      ingest(parsed);
    } catch { toast('CSVの読み込みに失敗しました'); }
  }, [ingest, toast, csvPresets]);

  // ── 列の割り当て ──
  const setMap = (patch) => setMapping((m) => ({ ...m, ...patch }));
  const mappedRows = useMemo(() => {
    if (!mapping || missingRoles(mapping.roles).length) return [];
    const data = mapping.firstIsHeader ? mapping.raw.slice(1) : mapping.raw;
    return applyRoles(data, mapping.roles, { expenseSign: mapping.sign });
  }, [mapping]);

  const choosePreset = (id) => {
    const p = csvPresets.find((x) => x.id === id);
    if (!p) { setMap({ presetId: '' }); return; }
    setMap({
      presetId: p.id, sign: p.sign || 'positive',
      ...(p.roles?.length === mapping.cols ? { roles: p.roles } : {}),
      expenseId: p.expenseId || '', accountId: p.accountId || '', incomeId: p.incomeId || '',
    });
  };
  const deletePreset = () => {
    if (!mapping?.presetId) return;
    const next = csvPresets.filter((p) => p.id !== mapping.presetId);
    setCsvPresets(next); saveCsvPresets(next);
    setMap({ presetId: '' });
    toast('割り当てを削除しました');
  };

  // 割り当てを当てて、いつもの確認の表へ進む。名前が入っていれば、割り当てを保存（同じ名前なら上書き）する
  const applyMap = () => {
    if (!mappedRows.length) return;
    const name = mapping.saveName.trim();
    if (name || mapping.presetId) {
      const header = mapping.firstIsHeader ? mapping.raw[0] : [];
      const sig = presetSig(header, !mapping.firstIsHeader, mapping.cols);
      const base = csvPresets.find((p) => (name ? p.name === name : p.id === mapping.presetId));
      const item = {
        id: base?.id || uid(), name: name || base?.name || '', sig, headerless: !mapping.firstIsHeader,
        roles: mapping.roles, sign: mapping.sign,
        expenseId: mapping.expenseId, accountId: mapping.accountId, incomeId: mapping.incomeId,
      };
      const next = base ? csvPresets.map((p) => (p.id === base.id ? item : p)) : [...csvPresets, item];
      setCsvPresets(next); saveCsvPresets(next);
    }
    setMapping(null);
    // CSV の科目名がこの帳簿に無くても弾かない。確認の表の上で、名前ごとに科目を割り当ててもらう（MF/Zaim と同じ）
    setSrcFormat('mapped');
    ingest(mappedRows, { expense: mapping.expenseId, account: mapping.accountId, income: mapping.incomeId });
  };

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
      const { amount: am, da, ca, mismatch } = csvAmount(r);
      const ds = (r[CC.ds] || '').trim();
      const dri = drOverride[i] || resolveAccount(accounts, r[CC.da]);
      const cri = crOverride[i] || resolveAccount(accounts, r[CC.ca]);
      if (!dt) { er.push(`行${ln}:日付`); return; }
      if (!dri) { er.push(`行${ln}:借方`); return; }
      if (!cri) { er.push(`行${ln}:貸方`); return; }
      if (am <= 0) { er.push(`行${ln}:金額`); return; }
      if (mismatch) { er.push(`行${ln}:貸借の金額が不一致（借方${da.toLocaleString()}・貸方${ca.toLocaleString()}）`); return; }
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
      </> : step === 'presets' ? <>
        <button className="btn btn-g" onClick={() => setManaging(false)}>← 戻る</button>
      </> : step === 'map' ? <>
        <button className="btn btn-g" onClick={reset}>← 戻る</button>
        <button className="btn btn-p" onClick={applyMap} disabled={!mappedRows.length}>この割り当てで読み込む（{mappedRows.length}件）</button>
      </> : null}>

      {step === 'presets' ? (
        <PresetManager presets={csvPresets} accounts={sortedAccounts}
          onSave={(next) => { setCsvPresets(next); saveCsvPresets(next); toast('保存しました'); }} />
      ) : step === 'map' ? (
        <MappingStep mapping={mapping} setMap={setMap} accounts={sortedAccounts} presets={csvPresets}
          choosePreset={choosePreset} deletePreset={deletePreset} count={mappedRows.length}
          onManage={() => setManaging(true)} />
      ) : step === 1 ? (
        <div>
          <div className="info-b mb-10">
            {/* Zaim の実際の書き出しは csv.js の読み方と列が合わず0件になるので、ここでは挙げない（Zaim からは「他のアプリから移行」） */}
            <div>マネーフォワードのCSVは<strong>自動で判定して取り込みます</strong>（費目・口座は次の画面で科目に割り当て）。</div>
            <div style={{ marginTop: 4 }}>それ以外（本アプリの書き出し・カード会社・銀行の明細）は、次の画面で<strong>列ごとに何の項目かを選んで</strong>取り込みます。割り当ては名前を付けて保存できます。</div>
          </div>
          {/* ここは既存の科目に仕訳を足すだけ。科目ごと持ってくる移行は別画面なので、迷って来た人を案内する */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12, color: 'var(--tx2)', marginBottom: 10 }}>
            {csvPresets.length > 0 && (
              <button className="btn btn-g btn-s" onClick={() => setManaging(true)}>保存した割り当てを管理（{csvPresets.length}件）</button>
            )}
            他のアプリから科目ごとまとめて移すときは
            <button className="btn btn-g btn-s" disabled={guestMode} onClick={() => { handleClose(); onMigrate(); }}>他アプリからのデータの移行はこちら</button>
            {guestMode && <span style={{ color: 'var(--tx3)' }}>アカウント登録すると使えます</span>}
          </div>
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
          {srcFormat !== 'native' && (srcFormat !== 'mapped' || foreignLabels.length > 0) && (
            <div className="csv-map" style={{ background: 'var(--acb)', border: '1px solid var(--ac)', borderRadius: 6, padding: '12px 14px', marginBottom: 12 }}>
              <div style={{ fontSize: 12.5, color: 'var(--tx)', fontWeight: 600, marginBottom: foreignLabels.length ? 8 : 0 }}>
                {srcFormat === 'mapped' ? 'この帳簿に同じ名前が無い科目があります。' : `「${srcFormat === 'mf' ? 'マネーフォワード' : 'Zaim'}」形式を検出しました。`}
                {foreignLabels.length > 0
                  ? 'CSV の科目名を、この帳簿の科目に割り当ててください（同じ名前の行すべてに反映されます）。'
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
                  const { amount: am, mismatch } = csvAmount(r);
                  const isDup = dupFlags[i];
                  const desc = (r[CC.ds] || '').trim();
                  const rule = (!dri || !cri) ? matchRule(rules, desc) : null;
                  const warn = [];
                  if (!dt) warn.push('日付');
                  if (am <= 0) warn.push('金額');
                  if (mismatch) warn.push('貸借の金額が不一致');
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

// 列の割り当て。CSV の行をそのまま表にし、列（縦）ごとに「この列は何か」を選ぶ。
const PREVIEW_ROWS = 30;
// 金額の符号の説明（「？」で開く）。モバイル（manage/csv.jsx）と同じ文
const SIGN_HELP = 'カードの明細は、使った金額が「1,200」のように正の数で並ぶものがほとんどです（支出が正の数）。'
  + '銀行の明細などで、使った金額が「-1,200」のように負の数で並ぶときは「支出が負の数」を選びます。'
  + 'どちらの場合も、支出と逆の符号の行（返金・キャンセル）は取り込みません。金額の列を選んだときだけ使います。';
const ROLE_LABEL = Object.fromEntries(COLUMN_ROLES.map((r) => [r.value, r.label]));

function MappingStep({ mapping, setMap, accounts, presets, choosePreset, deletePreset, count, onManage }) {
  const { raw, firstIsHeader, cols, roles, sign } = mapping;
  const header = firstIsHeader ? raw[0] : null;
  const data = firstIsHeader ? raw.slice(1) : raw;
  const has = (r) => roles.includes(r);
  const missing = missingRoles(roles);
  const setRole = (i, v) => setMap({ roles: roles.map((r, j) => (j === i ? v : r)) });
  const [signHelp, setSignHelp] = useState(false);
  const [showSkipped, setShowSkipped] = useState(false);
  // 列の項目を選ぶメニュー。表は横にスクロールする箱の中なので、メニューは画面に対する位置で出す
  const [menu, setMenu] = useState(null); // { col, left, top }
  const skipped = useMemo(() => (missing.length ? [] : skippedRows(data, roles, { expenseSign: sign })),
    // data は raw と firstIsHeader から導出される
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [raw, firstIsHeader, roles, sign, missing.length]);

  const acctSelect = (key, types, placeholder) => (
    <select className="fc" value={mapping[key]} style={{ maxWidth: 300 }} onChange={(e) => setMap({ [key]: e.target.value })}>
      <option value="">{placeholder}</option>
      {accounts.filter((a) => types.includes(a.type)).map((a) => <option key={a.id} value={a.id}>{a.code ? `${a.code} ` : ''}{a.name}</option>)}
    </select>
  );
  const row = (label, control) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
      <span style={{ width: 170, fontSize: 13, color: 'var(--tx2)' }}>{label}</span>{control}
    </div>
  );
  const spends = has('amount') || has('out');
  // 口座・カードを聞くのは、支出の貸方か入金の借方を列から取れないときだけ
  const needAccount = (spends && !has('cr')) || (has('in') && !has('dr'));
  return (
    <div>
      <div className="info-b mb-10">
        CSV を列ごとに分けました。<strong>表の一番上を押して、それぞれの列が何かを選んでください</strong>（使わない列は「使わない」のまま）。
        日付と金額（または出金額・入金額）の列が要ります。
      </div>

      {presets.length > 0 && row('保存した割り当て', (
        <span style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, flexWrap: 'wrap' }}>
          <select className="fc" value={mapping.presetId} style={{ maxWidth: 220 }} onChange={(e) => choosePreset(e.target.value)}>
            <option value="">（使わない）</option>
            {presets.map((p) => <option key={p.id} value={p.id}>{p.name || '（名前なし）'}</option>)}
          </select>
          {mapping.presetId && <button className="btn btn-d btn-s" onClick={deletePreset}>削除</button>}
          <button className="btn btn-g btn-s" onClick={onManage}>保存した割り当てを管理</button>
        </span>
      ))}
      {has('amount') && (
        <div style={{ marginBottom: 8 }}>
          {row((
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              金額の符号
              <button type="button" onClick={() => setSignHelp((v) => !v)} aria-label="金額の符号の説明" title="金額の符号の説明"
                style={{ width: 18, height: 18, borderRadius: 9, border: '1.5px solid var(--tx3)', background: 'none', color: 'var(--tx3)', fontSize: 11, fontWeight: 800, lineHeight: '14px', padding: 0, cursor: 'pointer' }}>?</button>
            </span>
          ), (
            <span style={{ display: 'flex', gap: 14, fontSize: 13 }}>
              <label><input type="radio" checked={sign === 'positive'} onChange={() => setMap({ sign: 'positive' })} /> 支出が正の数</label>
              <label><input type="radio" checked={sign === 'negative'} onChange={() => setMap({ sign: 'negative' })} /> 支出が負の数</label>
            </span>
          ))}
          {signHelp && <div style={{ fontSize: 12, color: 'var(--tx2)', lineHeight: 1.7, margin: '-2px 0 8px 180px', maxWidth: 560 }}>{SIGN_HELP}</div>}
        </div>
      )}
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 8 }}>
        <input type="checkbox" checked={firstIsHeader} onChange={(e) => setMap({ firstIsHeader: e.target.checked })} />
        1行目は見出し（取り込まない）
      </label>

      <div className="csv-pw">
        <table>
          <thead>
            <tr>
              <th style={{ width: 34 }} />
              {Array.from({ length: cols }, (_, i) => (
                <th key={i} style={{ minWidth: 120 }}>
                  <button type="button" className="csv-sel"
                    onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu(menu?.col === i ? null : { col: i, left: r.left, top: r.bottom + 4 }); }}
                    style={{ width: '100%', textAlign: 'left', cursor: 'pointer', fontWeight: roles[i] === 'none' ? 400 : 700, color: roles[i] === 'none' ? 'var(--tx3)' : 'var(--ac)' }}>
                    {ROLE_LABEL[roles[i]]} ▾
                  </button>
                </th>
              ))}
            </tr>
            {header && (
              <tr>
                <th className="mono" style={{ color: 'var(--tx3)', fontWeight: 400 }}>見出し</th>
                {Array.from({ length: cols }, (_, i) => <th key={i} style={{ color: 'var(--tx2)' }}>{header[i] ?? ''}</th>)}
              </tr>
            )}
          </thead>
          <tbody>
            {data.slice(0, PREVIEW_ROWS).map((r, k) => (
              <tr key={k}>
                <td className="mono" style={{ color: 'var(--tx3)' }}>{k + 1}</td>
                {Array.from({ length: cols }, (_, i) => (
                  <td key={i} className={roles[i] === 'none' ? '' : 'mono'}
                    style={{ color: roles[i] === 'none' ? 'var(--tx3)' : 'var(--tx)', whiteSpace: 'nowrap' }}>{r[i] ?? ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.length > PREVIEW_ROWS && (
        <div style={{ fontSize: 11.5, color: 'var(--tx3)', margin: '4px 0 0' }}>先頭の {PREVIEW_ROWS} 行を表示しています（全 {data.length} 行）。</div>
      )}

      {/* 列の項目を選ぶメニュー（選択肢の横に説明） */}
      {menu && (
        <>
          <div onClick={() => setMenu(null)} style={{ position: 'fixed', inset: 0, zIndex: 1000 }} />
          <div role="menu" style={{
            position: 'fixed', left: Math.min(menu.left, window.innerWidth - 440), top: Math.min(menu.top, window.innerHeight - 380), zIndex: 1001,
            width: 420, background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.18)', padding: '6px 0',
          }}>
            <div style={{ fontSize: 12, color: 'var(--tx3)', padding: '4px 12px 6px' }}>
              {menu.col + 1}列目{header?.[menu.col] ? `「${header[menu.col]}」` : ''}は
            </div>
            {COLUMN_ROLES.map((r) => {
              const on = roles[menu.col] === r.value;
              return (
                <button key={r.value} type="button" role="menuitem" onClick={() => { setRole(menu.col, r.value); setMenu(null); }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', border: 0, cursor: 'pointer', padding: '7px 12px', fontSize: 13,
                    background: on ? 'var(--acb)' : 'transparent', color: on ? 'var(--ac)' : 'var(--tx)', fontWeight: on ? 700 : 400 }}>
                  {r.label}<span style={{ color: 'var(--tx3)', fontWeight: 400 }}>{`  －  ${r.help}`}</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      <div style={{ marginTop: 14 }}>
        {spends && !has('dr') && row('支出の費目（借方）', acctSelect('expenseId', ['expense', 'asset', 'liability'], '（次の画面で選ぶ）'))}
        {needAccount && row(has('in') ? '口座・カード（入出金した先）' : '支払方法（貸方）', acctSelect('accountId', ['asset', 'liability'], '（次の画面で選ぶ）'))}
        {has('in') && !has('cr') && row('入金の科目（貸方）', acctSelect('incomeId', ['income', 'asset', 'liability'], '（次の画面で選ぶ）'))}
        <div style={{ fontSize: 11.5, color: 'var(--tx3)', margin: '-2px 0 10px 180px' }}>
          摘要が自動仕訳ルールに当たる行は、ルールの科目が優先されます。CSV の科目名がこの帳簿に無いときは、次の画面で科目に割り当てられます。
        </div>
        {row('名前を付けて保存（任意）', (
          <input className="fc" value={mapping.saveName} style={{ maxWidth: 260 }} placeholder={mapping.presetId ? '空なら選んだ割り当てを上書き' : '例: 三井住友カード'}
            onChange={(e) => setMap({ saveName: e.target.value })} />
        ))}
        <div style={{ fontSize: 12.5, color: missing.length || !count ? 'var(--red)' : 'var(--tx2)', marginTop: 4 }}>
          {missing.length ? `「${missing.join('」「')}」の列を選んでください。`
            : count ? `${count}件を読み取れます。` : '読み取れる行がありません。日付と金額の列を確かめてください。'}
          {skipped.length > 0 && (
            <button type="button" onClick={() => setShowSkipped((v) => !v)}
              style={{ marginLeft: 8, border: 0, background: 'none', color: 'var(--ac)', fontWeight: 600, cursor: 'pointer', fontSize: 12.5, padding: 0 }}>
              {skipped.length} 行は対象外 {showSkipped ? '▴' : '▾'}
            </button>
          )}
        </div>
        {showSkipped && skipped.length > 0 && (
          <div style={{ marginTop: 6, background: 'var(--bg3)', borderRadius: 6, padding: '8px 10px', maxHeight: 180, overflowY: 'auto' }}>
            {skipped.slice(0, 100).map((x) => (
              <div key={x.line} style={{ fontSize: 12, marginBottom: 6 }}>
                {/* CSV ファイルでの行番号（見出しがあれば1つずれる） */}
                <div style={{ color: 'var(--tx2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {`${x.line + (firstIsHeader ? 1 : 0)}行目: ${x.row.filter((c) => String(c ?? '').trim()).join(' / ')}`}
                </div>
                <div style={{ color: 'var(--red)' }}>{x.reason}</div>
              </div>
            ))}
            {skipped.length > 100 && <div style={{ fontSize: 12, color: 'var(--tx3)' }}>ほか {skipped.length - 100} 行</div>}
          </div>
        )}
      </div>
    </div>
  );
}

/** 保存した見出し（署名）から列の名前を出す。見出し無しの CSV は「n列目」 */
const columnNames = (p) => {
  const n = p.roles?.length || 0;
  const heads = p.headerless ? [] : String(p.sig || '').split('|');
  return Array.from({ length: n }, (_, i) => heads[i] || `${i + 1}列目`);
};

// 保存した割り当ての管理。名前・列の項目・符号・科目を直し、消せる。追加は CSV を読み込んで名前を付けて取り込む
function PresetManager({ presets, accounts, onSave }) {
  const [editing, setEditing] = useState(null); // 編集中の写し
  const name = (id) => accounts.find((a) => a.id === id)?.name || '—';
  const acctSelect = (key, types) => (
    <select className="fc" value={editing[key] || ''} style={{ maxWidth: 260 }} onChange={(e) => setEditing((x) => ({ ...x, [key]: e.target.value }))}>
      <option value="">（取り込みのときに選ぶ）</option>
      {accounts.filter((a) => types.includes(a.type)).map((a) => <option key={a.id} value={a.id}>{a.code ? `${a.code} ` : ''}{a.name}</option>)}
    </select>
  );
  const remove = (p) => {
    if (!window.confirm(`「${p.name || '（名前なし）'}」の割り当てを削除しますか？`)) return;
    onSave(presets.filter((x) => x.id !== p.id));
    setEditing(null);
  };

  if (editing) {
    const cols = columnNames(editing);
    const has = (r) => editing.roles.includes(r);
    const line = (label, control) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ width: 200, fontSize: 13, color: 'var(--tx2)' }}>{label}</span>{control}
      </div>
    );
    return (
      <div>
        {line('名前', <input className="fc" value={editing.name} style={{ maxWidth: 260 }} onChange={(e) => setEditing((x) => ({ ...x, name: e.target.value }))} />)}
        <div style={{ fontSize: 12.5, color: 'var(--tx3)', margin: '6px 0' }}>列の項目（保存したときの CSV の見出し）</div>
        {cols.map((c, i) => line(`${i + 1}. ${c}`, (
          <select className="fc" value={editing.roles[i]} style={{ maxWidth: 360 }}
            onChange={(e) => setEditing((x) => ({ ...x, roles: x.roles.map((r, j) => (j === i ? e.target.value : r)) }))}>
            {COLUMN_ROLES.map((r) => <option key={r.value} value={r.value}>{`${r.label} － ${r.help}`}</option>)}
          </select>
        )))}
        {has('amount') && line('金額の符号', (
          <span style={{ display: 'flex', gap: 14, fontSize: 13 }}>
            <label><input type="radio" checked={(editing.sign || 'positive') === 'positive'} onChange={() => setEditing((x) => ({ ...x, sign: 'positive' }))} /> 支出が正の数</label>
            <label><input type="radio" checked={editing.sign === 'negative'} onChange={() => setEditing((x) => ({ ...x, sign: 'negative' }))} /> 支出が負の数</label>
          </span>
        ))}
        {line('費目（支出の借方）', acctSelect('expenseId', ['expense', 'asset', 'liability']))}
        {line('口座・カード・支払方法', acctSelect('accountId', ['asset', 'liability']))}
        {has('in') && line('入金の科目（貸方）', acctSelect('incomeId', ['income', 'asset', 'liability']))}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="btn btn-p" onClick={() => { onSave(presets.map((x) => (x.id === editing.id ? editing : x))); setEditing(null); }}>保存</button>
          <button className="btn btn-g" onClick={() => setEditing(null)}>キャンセル</button>
          <button className="btn btn-d" style={{ marginLeft: 'auto' }} onClick={() => remove(editing)}>この割り当てを削除</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {presets.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--tx3)', padding: '12px 0' }}>保存した割り当てはありません。</div>
      ) : (
        <table style={{ width: '100%', fontSize: 13 }}>
          <tbody>
            {presets.map((p) => (
              <tr key={p.id}>
                <td style={{ padding: '8px 6px', verticalAlign: 'top' }}>
                  <div style={{ fontWeight: 700 }}>{p.name || '（名前なし）'}</div>
                  <div style={{ color: 'var(--tx3)', fontSize: 12 }}>
                    {(p.roles || []).map((r, j) => (r === 'none' ? null : `${columnNames(p)[j]}→${ROLE_LABEL[r]}`)).filter(Boolean).join('・') || '列の項目が未設定'}
                  </div>
                  <div style={{ color: 'var(--tx3)', fontSize: 12 }}>{`費目 ${name(p.expenseId)} ／ 支払方法 ${name(p.accountId)}`}</div>
                </td>
                <td style={{ padding: '8px 6px', whiteSpace: 'nowrap', textAlign: 'right', verticalAlign: 'top' }}>
                  <button className="btn btn-g btn-s" onClick={() => setEditing({ ...p, roles: [...(p.roles || [])] })}>編集</button>{' '}
                  <button className="btn btn-d btn-s" onClick={() => remove(p)}>削除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="info-b" style={{ marginTop: 12 }}>
        追加するときは、CSV を読み込んで列の項目を選び、「名前を付けて保存」に名前を入れて読み込みます。
      </div>
    </div>
  );
}
