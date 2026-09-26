import { useState, useRef, useMemo, useCallback } from 'react';
import { useData } from '../../contexts/DataContext';
import { useToast } from '../Common/Toast';
import { readCsvFile } from '../../utils/csv';
import { buildPairs, assignCodes, toPayload, markDuplicates } from '../../utils/migrate/core';
import { csvTable, jsonArrays, jsonTable } from '../../utils/migrate/source';
import { emptyMapping, parseWithMapping, missingFields } from '../../utils/migrate/mapping';
import { PRESETS, detectPreset, parseKamoku } from '../../utils/migrate/presets';
import { toGroups, checkGroup, groupJournal } from '../../utils/migrate/review';
import { ACCOUNT_TYPES, BADGE_CLASSES } from '../../utils/format';
import Modal from '../Common/Modal';
import ColumnMapStep from './ColumnMapStep';
import JournalReviewStep from './JournalReviewStep';

// 他の家計簿アプリからの移行（CSV・JSON）。変換は utils/migrate/、仕様は docs/plan-migrate-generic-2026-09.md。
// 流れ：ファイル選択 → マッピング（列と科目を1つの画面で。決まった形式は最初から入れておく）→ 仕訳明細（1行ずつ見て直す）→ 取込。
// 取込は端末の中だけで行い、書き込みは addAccount / addJournal（保存方式ごとの振り分けと仕訳の貸借検証を通すため）。

const NO_DUPS = new Set();
const LAST = String.fromCharCode(0xffff); // 並べ替えで最後に来る文字
const ROLE_LABEL = { account: '口座', category: 'カテゴリ' };
const heading = { fontSize: 13.5, fontWeight: 600, color: 'var(--tx)', margin: '18px 0 4px' };

// 説明ページ（LP のガイド記事）。途中まで作ったマッピングや直した仕訳が消えないよう、新しいタブで開く。
// どの画面から開いたかは、LP の GA4 で utm_content を数える（アプリには計測を入れない）
const guideUrl = (where, anchor) =>
  `https://kurofukubo.com/guide-migrate.html?utm_source=app&utm_medium=referral&utm_campaign=migrate_help&utm_content=${where}#${anchor}`;
const helpLink = (where, anchor, label = '説明') => (
  <a href={guideUrl(where, anchor)} target="_blank" rel="noopener" style={{ fontSize: 12, fontWeight: 400, marginLeft: 8, color: 'var(--ac)' }}>{label} ↗</a>
);

function csvSource(name, text, header) {
  const table = csvTable(text, header);
  return { name, kind: 'csv', text, header, table, preset: header ? detectPreset(table.columns, text) : null };
}

function jsonSource(name, json, arrays, arrayIndex) {
  return { name, kind: 'json', json, arrays, arrayIndex, table: jsonTable(json, arrays[arrayIndex].path), preset: null };
}

export default function MigrateModal({ open, onClose }) {
  const { accounts, journals, addAccount, addJournal } = useData();
  const toast = useToast();
  const fileRef = useRef(null);
  const kamokuRef = useRef(null);
  // 押せない理由の場所（下端の「理由を見る」などで、そこまで送る）
  const colRef = useRef(null);
  const errRef = useRef(null);
  const acctRef = useRef(null);
  const dupRef = useRef(null);

  const [source, setSource] = useState(null);    // 読み込んだ仕訳のファイル（csvSource / jsonSource）
  const [master, setMaster] = useState(null);    // 「複式家計簿」の科目ファイル { name, table }
  const [mapping, setMapping] = useState(null);  // 列のマッピング（mapping.js の対応付けのデータ）
  const [step, setStep] = useState('map');       // ファイルを選んだあとの画面：'map'（マッピング）| 'review'（仕訳明細）
  const [dragOver, setDragOver] = useState(false);
  const [edits, setEdits] = useState({});        // 科目のマッピングで手で変えたところ：組のキー → { to: 科目ID | 'new', name, type }
  const [groups, setGroups] = useState(null);    // 仕訳明細で直している仕訳（review.js の toGroups）
  const [groupsFor, setGroupsFor] = useState(null); // groups を作ったときの列のマッピング（変わったら作り直す）
  const [jumpReq, setJumpReq] = useState(0);     // 下端の「直す仕訳へ」を仕訳明細の画面に伝える
  const [includeDups, setIncludeDups] = useState(false);
  const [progress, setProgress] = useState(null); // { done, total, accounts, finished, failed }

  const importing = !!progress && !progress.finished && !progress.failed;
  const unit = source?.kind === 'json' ? '件目' : '行';
  const isFukushiki = source?.preset === 'fukushiki1' || source?.preset === 'fukushiki3';

  const reset = useCallback(() => {
    setSource(null); setMaster(null); setMapping(null); setStep('map');
    setEdits({}); setGroups(null); setGroupsFor(null); setIncludeDups(false); setProgress(null);
    if (fileRef.current) fileRef.current.value = '';
  }, []);

  const handleClose = () => { if (importing) return; reset(); onClose(); };

  // 読むファイル（か見出し・配列の選び方）を変えたら、マッピングは最初から。決まった形式なら自動で入れる
  const loadSource = useCallback((s) => {
    setSource(s);
    setMapping(s.preset ? PRESETS[s.preset].build(s.table.columns) : emptyMapping());
    setStep('map');
    setEdits({}); setGroups(null); setGroupsFor(null); setIncludeDups(false);
  }, []);

  const handleFiles = useCallback(async (list) => {
    let next = null;
    for (const f of list) {
      try {
        const text = await readCsvFile(f);
        const head = text.replace(/^\s+/, '');
        if (head.startsWith('{') || head.startsWith('[')) {
          let json;
          try { json = JSON.parse(text); } catch { toast(`${f.name}：JSON として読めません`); continue; }
          const arrays = jsonArrays(json);
          if (!arrays.length) { toast(`${f.name}：取引の配列が見つかりません`); continue; }
          // 既定は件数のいちばん多い配列（取引の明細であることが多い）
          const best = arrays.reduce((b, a, i) => (a.count > arrays[b].count ? i : b), 0);
          next = jsonSource(f.name, json, arrays, best);
          continue;
        }
        const s = csvSource(f.name, text, true);
        if (s.preset === 'fukushikiKamoku') { setMaster({ name: f.name, table: s.table }); continue; }
        if (!s.table.rows.length) { toast(`${f.name}：データの行がありません`); continue; }
        next = s;
      } catch { toast(`${f.name} を読み込めませんでした`); }
    }
    if (next) loadSource(next);
  }, [toast, loadSource]);

  // マッピングの画面で、あとから科目のファイルを選ぶ（仕訳のファイルと取り違えないよう、科目のファイル以外は受け付けない）
  const handleKamoku = async (f) => {
    if (!f) return;
    try {
      const s = csvSource(f.name, await readCsvFile(f), true);
      if (s.preset !== 'fukushikiKamoku') { toast(`${f.name}：科目のファイル（kamoku.csv）ではありません`); return; }
      setMaster({ name: f.name, table: s.table });
    } catch { toast(`${f.name} を読み込めませんでした`); }
  };

  // マッピングを変えるたびに全行を読み直す（数千行でも一瞬）
  const parsed = useMemo(() => (source && mapping ? parseWithMapping(source.table, mapping) : null), [source, mapping]);
  const kamoku = useMemo(() => (isFukushiki && master ? parseKamoku(master.table) : null), [isFukushiki, master]);
  // 明細はあるのに仕訳にできなかったもの（仕訳明細の画面で直せる）と、明細も作れなかった行（列のマッピングで直す）
  const fixable = useMemo(() => (parsed ? parsed.errors.filter((e) => e.lines && e.lines.length) : []), [parsed]);
  const readErrors = parsed ? parsed.errors.filter((e) => !(e.lines && e.lines.length)) : [];
  // 科目の組は、直せる仕訳の科目も含める（直したあとに使うため）
  const pairs = useMemo(() => (parsed ? buildPairs([...parsed.journals, ...fixable], kamoku, accounts) : []), [parsed, fixable, kamoku, accounts]);
  const assign = useMemo(
    () => Object.fromEntries(pairs.map((p) => [p.key, { to: p.matchId || 'new', name: p.name, type: p.type, ...edits[p.key] }])),
    [pairs, edits]
  );
  const missing = mapping ? missingFields(mapping) : [];

  const setPair = (key, patch) => setEdits((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  // 手で選ぶプルダウン。非表示の科目は出さない（自動の割り当ては非表示も対象）
  const sortedAccounts = useMemo(
    () => accounts.filter((a) => !a.hidden).sort((a, b) => (a.code || '').localeCompare(b.code || '')),
    [accounts]
  );
  const accountById = useMemo(() => Object.fromEntries(accounts.map((a) => [a.id, a])), [accounts]);

  // 仕訳明細の科目のプルダウン：ファイルの科目（科目のマッピングで決めた先の名前で出す）と、くろふくぼの科目
  const acctOptions = useMemo(() => ({
    pairs: pairs.map((p) => {
      const a = assign[p.key], t = accountById[a.to];
      return { value: 'p:' + p.key, label: a.to === 'new' ? `${a.name.trim() || p.srcName}（新しく作る）` : t ? `${t.code ? t.code + ' ' : ''}${t.name}` : p.srcName };
    }),
    accounts: sortedAccounts.map((a) => ({ value: 'a:' + a.id, label: `${a.code ? a.code + ' ' : ''}${a.name}` })),
  }), [pairs, assign, accountById, sortedAccounts]);
  // 科目の順に並べるときの並び。既存の科目はそのコード、新しく作る科目は元のファイルのコード、その次に名前
  const acctKey = useMemo(() => {
    const key = new Map();
    for (const p of pairs) {
      const a = assign[p.key], t = accountById[a.to];
      key.set('p:' + p.key, t ? `${t.code || ''} ${t.name}` : `${p.code || ''} ${a.name}`);
    }
    for (const a of accounts) key.set('a:' + a.id, `${a.code || ''} ${a.name}`);
    return (acct) => key.get(acct) || LAST; // 科目が無い行は最後へ
  }, [pairs, assign, accountById, accounts]);

  const checks = useMemo(() => new Map((groups || []).map((g) => [g.no, checkGroup(g)])), [groups]);
  // 行の科目 → 科目ID。新しく作る組はまだIDが無いので、重複の判定では既存の仕訳と一致しない仮のIDにする
  const provisionalId = (acct) => {
    if (acct.startsWith('a:')) return acct.slice(2);
    const a = assign[acct.slice(2)];
    return !a || a.to === 'new' ? `new:${acct}` : a.to;
  };
  // 重複の判定（取り込める仕訳だけ）。取込中は journals が1件ずつ増えるたびに比べ直すことになるので止める
  const dupNos = useMemo(() => {
    if (step !== 'review' || !groups || progress) return NO_DUPS;
    const oks = groups.filter((g) => g.lines.length && checks.get(g.no).ok);
    const flags = markDuplicates(oks.map((g) => ({ date: g.date, lines: g.lines.map((l) => ({ accountId: provisionalId(l.acct), side: l.side, amount: l.amount })) })), journals);
    return new Set(oks.filter((_, i) => flags[i]).map((g) => g.no));
  }, [step, groups, checks, assign, journals, progress]); // eslint-disable-line react-hooks/exhaustive-deps

  const badCount = (groups || []).filter((g) => g.lines.length && !checks.get(g.no).ok).length;
  const targets = step === 'review' && groups ? groups.filter((g) => g.lines.length && checks.get(g.no).ok && (includeDups || !dupNos.has(g.no))) : [];
  const incomplete = pairs.filter((p) => assign[p.key]?.to === 'new' && (!assign[p.key].type || !assign[p.key].name.trim()));
  const blankTypes = pairs.filter((p) => assign[p.key]?.to === 'new' && !assign[p.key].type);

  const setBlankTypes = (type) => {
    if (!type) return;
    setEdits((prev) => {
      const next = { ...prev };
      for (const p of blankTypes) next[p.key] = { ...next[p.key], type };
      return next;
    });
  };

  const handleImport = async () => {
    if (importing || !targets.length || incomplete.length) return;
    const total = targets.length;
    let done = 0, made = 0, stage = '科目の作成';
    setProgress({ done, total, accounts: made });
    try {
      // 行の科目（'p:組のキー' / 'a:科目ID'）→ 科目ID。取り込む仕訳で使う組だけ、新しい科目を作る。コードは一覧の並び順に振る
      const used = new Set(targets.flatMap((g) => g.lines.map((l) => l.acct)));
      const ids = {};
      for (const v of used) if (v.startsWith('a:')) ids[v] = v.slice(2);
      for (const p of pairs) if (used.has('p:' + p.key) && assign[p.key].to !== 'new') ids['p:' + p.key] = assign[p.key].to;
      const news = pairs.filter((p) => used.has('p:' + p.key) && assign[p.key].to === 'new');
      const codes = assignCodes(news.map((p) => ({ key: p.key, type: assign[p.key].type })), accounts);
      for (const [i, p] of news.entries()) {
        const a = assign[p.key];
        const created = await addAccount({ name: a.name.trim(), type: a.type, code: codes[i], note: '', ...(p.hidden ? { hidden: 1 } : {}) });
        ids['p:' + p.key] = created.id;
        made++;
        setProgress({ done, total, accounts: made });
      }
      for (const g of targets) {
        stage = `${done + 1}件目の仕訳`;
        await addJournal(toPayload(groupJournal(g), ids));
        done++;
        setProgress({ done, total, accounts: made });
      }
      setProgress({ done, total, accounts: made, finished: true });
    } catch (e) {
      setProgress({ done, total, accounts: made, failed: `${stage}で止まりました（${e?.message || '保存できませんでした'}）` });
    }
  };

  const dates = parsed ? parsed.journals.map((j) => j.date).sort() : [];
  const lineCount = parsed ? parsed.journals.reduce((s, j) => s + j.lines.length, 0) : 0;
  // 読み飛ばした行：理由ごとの数と、どの行か（多いときは先頭だけ）
  const excludedText = parsed ? Object.entries(parsed.excluded).filter(([, n]) => n).map(([k, n]) => {
    const rows = parsed.excludedRows[k] || [];
    const at = unit === '件目' ? `${rows.slice(0, 5).join(', ')} 件目` : `行 ${rows.slice(0, 5).join(', ')}`;
    return `${k} → ${n}${unit === '件目' ? '件' : '行'}（${at}${rows.length > 5 ? ' ほか' : ''}）`;
  }).join('／') : '';
  const view = progress ? 'progress' : source ? step : 'file';

  // 仕訳明細へ。列のマッピングが前と同じなら、直した内容をそのまま使う
  const toReview = () => {
    if (groupsFor !== mapping) { setGroups(toGroups(parsed)); setGroupsFor(mapping); }
    setStep('review');
  };

  // 押せない理由は、ボタンの横に出す（表の下に置くと、下端に貼り付けたボタンの裏に隠れる）
  const reason = (text) => text && (
    <span style={{ flex: '1 1 240px', alignSelf: 'center', fontSize: 12, color: 'var(--red)' }}>{text}</span>
  );
  // 幅が足りないとき（スマホ）は2つのボタンをまとめて次の行へ送る
  const buttons = (children) => <div style={{ display: 'flex', gap: 7, marginLeft: 'auto' }}>{children}</div>;

  // 次へ・取込のボタンが押せないときの理由と、その場所（理由は画面のずっと上にあることが多いので、送るボタンを添える）。
  // go は押したときの動き（ref ならそこへ送る）
  const scrollTo = (ref) => () => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const blocked = view === 'map' ? (
    missing.length ? { text: `足りない項目があります：${missing.join('、')}。列のマッピングの右側で選んでください。`, label: '列のマッピングへ', go: scrollTo(colRef) }
    : !parsed.journals.length && !fixable.length && readErrors.length ? { text: `仕訳にできる行がありません（読み取れない行が ${readErrors.length} 件）。`, label: '理由を見る', go: scrollTo(errRef) }
    : !parsed.journals.length && !fixable.length ? {
      text: excludedText ? `仕訳にできる行がありません。すべての行を読み飛ばしています（${excludedText}）。` : '仕訳にできる行がありません。列のマッピングを見直してください。',
      label: '列のマッピングへ', go: scrollTo(colRef),
    }
    : incomplete.length ? {
      text: `区分か名前が空の科目があります（${incomplete.slice(0, 3).map((p) => `${p.code ? p.code + ' ' : ''}${assign[p.key].name.trim() || p.srcName}`).join('、')}${incomplete.length > 3 ? ` ほか ${incomplete.length - 3} 件` : ''}）。選ぶと次へ進めます。`,
      label: '科目のマッピングへ', go: scrollTo(acctRef),
    }
    : null
  ) : view === 'review' && !targets.length ? (
    badCount ? { text: `取り込める仕訳がありません。赤い仕訳（${badCount} 件）を直すと取り込めます。`, label: '直す仕訳へ', go: () => setJumpReq((n) => n + 1) }
    : dupNos.size ? { text: `すべて取込済みの仕訳と同じです（${dupNos.size} 件）。もう一度取り込むときは、チェックを入れてください。`, label: 'チェックの場所へ', go: scrollTo(dupRef) }
    : { text: '取り込む仕訳がありません。' }
  ) : null;
  // 取り込めるが、直していない仕訳が残っているとき（押せるので赤にはしない）
  const leftover = view === 'review' && targets.length > 0 && badCount > 0;

  const footer = view === 'file' ? (
    <button className="btn btn-g" onClick={handleClose}>キャンセル</button>
  ) : view === 'map' || view === 'review' ? <>
    {blocked && reason(<>
      {blocked.text}
      {blocked.go && <button type="button" className="btn btn-g btn-s" style={{ marginLeft: 6 }} onClick={blocked.go}>{blocked.label}</button>}
    </>)}
    {leftover && (
      <span style={{ flex: '1 1 240px', alignSelf: 'center', fontSize: 12, color: 'var(--tx2)' }}>
        直していない赤い仕訳 {badCount} 件は取り込みません。
        <button type="button" className="btn btn-g btn-s" style={{ marginLeft: 6 }} onClick={() => setJumpReq((n) => n + 1)}>直す仕訳へ</button>
      </span>
    )}
    {view === 'map' ? buttons(<>
      <button className="btn btn-g" onClick={handleClose}>キャンセル</button>
      <button className="btn btn-p" onClick={toReview} disabled={!!blocked}>次へ（仕訳明細）</button>
    </>) : buttons(<>
      <button className="btn btn-g" onClick={() => setStep('map')}>戻る</button>
      <button className="btn btn-p" onClick={handleImport} disabled={!targets.length}>取込実行（{targets.length}件）</button>
    </>)}
  </> : importing ? null : (
    <button className="btn btn-p" onClick={handleClose}>閉じる</button>
  );

  return (
    <Modal open={open} onClose={handleClose} title="他のアプリから移行" wide hideClose={importing}>
      {view === 'file' && (
        <div>
          <div className="info-b mb-10">
            <div>他の家計簿アプリで書き出した <strong>CSV</strong> か <strong>JSON</strong> を選んでください。選ぶとマッピングの画面に進みます。ファイルはこの端末の中だけで読み取ります。</div>
            <div style={{ marginTop: 4 }}>Android の「複式家計簿」・マネーフォワード ME・Zaim は、マッピングを自動で入れます。それ以外のアプリ（弥生会計・Firefly III・自作の表など）も、マッピングの画面で列を選べば取り込めます。</div>
            <div style={{ marginTop: 4 }}>「複式家計簿」は科目のファイル（kamoku.csv）も一緒に選べます（任意）。日本円以外の取引と、予算・定期取引などは移行しません。</div>
            <div style={{ marginTop: 4 }}>くわしい手順は{helpLink('file', 'flow', '移行のしかた（説明ページ）')}</div>
          </div>
          <div className={`csv-drop ${dragOver ? 'dragover' : ''}`}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles([...e.dataTransfer.files]); }}>
            <p>クリックまたはドラッグ＆ドロップ</p>
          </div>
          <input ref={fileRef} type="file" multiple accept=".csv,.txt,.tsv,.json" style={{ display: 'none' }}
            onChange={(e) => { const fs = [...e.target.files]; e.target.value = ''; handleFiles(fs); }} />
          {master && <div style={{ marginTop: 12, fontSize: 13 }}>科目：<strong>{master.name}</strong>（仕訳のファイルを選んでください）</div>}
        </div>
      )}

      {view === 'map' && (
        <div>
          <div style={{ display: 'grid', gap: 6, fontSize: 13 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span>ファイル：<strong>{source.name}</strong> <span style={{ color: 'var(--tx3)' }}>
                （{source.preset ? `${PRESETS[source.preset].label}・マッピングを自動で入れました` : `${source.kind === 'json' ? 'JSON' : 'CSV'}・${source.table.rows.length.toLocaleString()} ${source.kind === 'json' ? '件' : '行'}`}）</span></span>
              <button className="btn btn-g btn-s" onClick={reset}>ファイルを選び直す</button>
            </div>
            {source.kind === 'csv' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={source.header} onChange={(e) => loadSource(csvSource(source.name, source.text, e.target.checked))} />
                1行目は見出し（列名）<span style={{ fontSize: 11.5, color: 'var(--tx3)' }}>見出しの無いファイル（弥生会計の仕訳など）は外してください</span>
              </label>
            )}
            {source.kind === 'json' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                取引の配列
                <select className="csv-sel" style={{ width: 'auto' }} value={source.arrayIndex}
                  onChange={(e) => loadSource(jsonSource(source.name, source.json, source.arrays, Number(e.target.value)))}>
                  {source.arrays.map((a, i) => <option key={a.label} value={i}>{a.label}（{a.count}件）</option>)}
                </select>
              </label>
            )}
            {isFukushiki && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                科目のファイル：{master ? <strong>{master.name}</strong> : <span style={{ color: 'var(--tx3)' }}>未選択（任意。補助科目の名前と非表示を引き継ぎます）</span>}
                <button className="btn btn-g btn-s" onClick={() => kamokuRef.current?.click()}>{master ? '選び直す' : '選ぶ'}</button>
                <input ref={kamokuRef} type="file" accept=".csv,.txt,.tsv" style={{ display: 'none' }}
                  onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; handleKamoku(f); }} />
              </div>
            )}
          </div>

          <div ref={colRef} style={heading}>列のマッピング{helpLink('columns', 'columns')}</div>
          <ColumnMapStep table={source.table} mapping={mapping} onChange={setMapping} preview={parsed} />

          <div style={heading}>科目のマッピング{helpLink('accounts', 'accounts')}</div>
          <div style={{ fontSize: 13, lineHeight: 1.9, marginBottom: 6 }}>
            <div>仕訳 <strong>{parsed.journals.length.toLocaleString()}</strong> 件（明細 {lineCount.toLocaleString()} 行）
              {dates.length > 0 && <span style={{ color: 'var(--tx2)' }}>　期間 {dates[0]} 〜 {dates[dates.length - 1]}</span>}</div>
            {fixable.length > 0 && (
              <div style={{ color: 'var(--red)' }}>
                ほかに、借方と貸方の金額が合わないなどで仕訳にできなかったものが {fixable.length} 件あります。次の「仕訳明細」の画面で直せます。
              </div>
            )}
            {excludedText && <div style={{ color: 'var(--tx2)' }}>読み飛ばした{unit === '件目' ? 'もの' : '行'}（取り込まない行）：{excludedText}</div>}
          </div>

          {/* 明細も作れなかった行（科目が空など）は列の読み方の問題なので、ここで出して列のマッピングで直してもらう */}
          {readErrors.length > 0 && (
            <div ref={errRef} style={{ border: '1px solid var(--red)', borderRadius: 6, padding: '8px 12px', marginBottom: 12 }}>
              <div style={{ fontSize: 12.5, color: 'var(--red)', fontWeight: 600, marginBottom: 4 }}>
                読み取れない行が {readErrors.length} 件あります（取り込みません）
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--tx2)', marginBottom: 6 }}>列のマッピングで、その項目の列が選ばれているか確かめてください。</div>
              <div style={{ maxHeight: 160, overflowY: 'auto', fontSize: 11.5, color: 'var(--tx2)' }}>
                {readErrors.map((e, i) => <div key={i}>{unit === '件目' ? `${e.rowNos.join(', ')} 件目` : `行 ${e.rowNos.join(', ')}`}：{e.reason}</div>)}
              </div>
            </div>
          )}

          <div style={{ fontSize: 11.5, color: 'var(--tx3)' }}>
            元の科目ごとに、くろふくぼのどの科目に入れるかを選びます。補助科目ごとに別の科目になります。既存の科目にまとめることもできます。
            区分は科目コード（単式では口座→資産、カテゴリ→費用か収益）から推定しているので、違っていたら直してください。
          </div>
          {blankTypes.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--tx2)' }}>区分が空の科目（{blankTypes.length} 件）をまとめて</span>
              <select className="csv-sel" style={{ width: 120, minWidth: 110 }} value="" onChange={(e) => setBlankTypes(e.target.value)}>
                <option value="">（選ぶ）</option>
                {Object.entries(ACCOUNT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          )}
          {/* 高さを抑えるとモーダルの中でさらにスクロールが入るので、ここでは抑えない */}
          <div ref={acctRef} className="csv-pw" style={{ maxHeight: 'none' }}>
            <table>
              <thead><tr><th>元の科目</th><th className="text-r">明細</th><th /><th>くろふくぼの科目</th><th>名前</th><th>区分</th></tr></thead>
              <tbody>
                {pairs.map((p) => {
                  const a = assign[p.key];
                  const isNew = a.to === 'new';
                  const target = accountById[a.to];
                  return (
                    <tr key={p.key}>
                      <td>
                        {p.code && <span className="mono" style={{ color: 'var(--tx3)' }}>{p.code} </span>}{p.srcName}
                        {p.srcSubName && p.srcSubName !== '-' && <span style={{ color: 'var(--tx2)' }}>／{p.srcSubName}</span>}
                        {p.role && <span style={{ fontSize: 10.5, color: 'var(--tx3)', marginLeft: 6 }}>{ROLE_LABEL[p.role]}</span>}
                      </td>
                      <td className="mono text-r">{p.count}</td>
                      <td style={{ color: 'var(--tx3)', width: 16 }}>→</td>
                      <td>
                        <select className="csv-sel" value={a.to} onChange={(e) => setPair(p.key, { to: e.target.value })}>
                          <option value="new">新しく作る</option>
                          {target?.hidden && <option value={target.id}>{target.code ? `${target.code} ` : ''}{target.name}</option>}
                          {sortedAccounts.map((x) => <option key={x.id} value={x.id}>{x.code ? `${x.code} ` : ''}{x.name}</option>)}
                        </select>
                      </td>
                      <td>
                        {isNew ? (
                          <>
                            <input className="csv-sel" value={a.name} maxLength={100} onChange={(e) => setPair(p.key, { name: e.target.value })} />
                            {p.hidden ? <div style={{ fontSize: 10.5, color: 'var(--tx3)', marginTop: 2 }}>非表示の科目として作ります</div> : null}
                          </>
                        ) : <span style={{ color: 'var(--tx3)', fontSize: 11.5 }}>既存の科目</span>}
                      </td>
                      <td>
                        {isNew ? (
                          <select className="csv-sel" style={{ minWidth: 96, borderColor: a.type ? undefined : 'var(--red)' }} value={a.type} onChange={(e) => setPair(p.key, { type: e.target.value })}>
                            <option value="">（選ぶ）</option>
                            {Object.entries(ACCOUNT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                        ) : target && <span className={`bdg ${BADGE_CLASSES[target.type] || ''}`}>{ACCOUNT_TYPES[target.type]}</span>}
                      </td>
                    </tr>
                  );
                })}
                {!pairs.length && (
                  <tr><td colSpan={6} style={{ color: 'var(--tx3)' }}>
                    {readErrors.length ? '仕訳にできる行が無いので、科目もありません' : '列のマッピングで科目と金額を選ぶと、ここに出ます'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === 'review' && (
        <div>
          <div style={{ ...heading, marginTop: 0 }}>仕訳明細{helpLink('review', 'review')}</div>
          <JournalReviewStep groups={groups} setGroups={setGroups} checks={checks} dupNos={dupNos}
            includeDups={includeDups} setIncludeDups={setIncludeDups} dupRef={dupRef}
            acctOptions={acctOptions} acctKey={acctKey} unit={unit} jumpReq={jumpReq} />
        </div>
      )}

      {view === 'progress' && (
        <div style={{ fontSize: 13, lineHeight: 1.9 }}>
          <div style={{ fontSize: 22, fontWeight: 600 }} className="mono">
            {progress.done.toLocaleString()} / {progress.total.toLocaleString()}
          </div>
          {importing && <div style={{ color: 'var(--tx2)' }}>取り込み中です。終わるまでこの画面を閉じないでください。</div>}
          {progress.finished && <div>仕訳 {progress.done.toLocaleString()} 件を取り込みました（新しく作った科目 {progress.accounts} 件）。</div>}
          {progress.failed && (
            <div style={{ color: 'var(--red)' }}>
              {progress.failed}。仕訳 {progress.done.toLocaleString()} 件までは取り込まれています。
              もう一度同じファイルを取り込むと、取込済みの仕訳は重複として外れます。
            </div>
          )}
        </div>
      )}

      {/* ボタンはモーダルの下端に貼り付ける。マッピングの表・エラー・注意書きでモーダルの高さの上限（90vh）を
          超えると、Modal の footer では下にはみ出し、スクロールしないと取込ボタンが見えなかった。
          影は下の余白（モーダルの padding）を背景色で埋め、後ろを流れる表が透けないようにするため */}
      {footer && (
        <div className="md-f" style={{ position: 'sticky', bottom: 0, background: 'var(--bg2)', boxShadow: '0 48px 0 var(--bg2)', flexWrap: 'wrap' }}>{footer}</div>
      )}
    </Modal>
  );
}
