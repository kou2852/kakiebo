// 他のアプリからの移行：決まった対応付け（見出しで自動判定し、マッピングの画面に最初から入れておく）。
// 中身は画面で作る対応付けと同じデータ（mapping.js の emptyMapping に上書きする）。
import { detectCsvFormat } from '../csv.js';
import { emptyMapping } from './mapping.js';

/** 補助科目コードが空か0なら補助科目なし（mapping.js と同じ） */
const normSub = (s) => (/^0*$/.test(s) ? '' : s);

/** 複式家計簿の「取り込まない行」：削除フラグ（見出しの表記が揺れやすいので「削除」で始まる列）と外貨 */
const fukushikiExclude = (columns) => {
  const del = columns.find((c) => c.startsWith('削除'));
  return [
    ...(del ? [{ col: [del], values: ['1'], label: '削除の印' }] : []),
    { col: ['通貨名'], notIn: ['', '日本円'], label: '日本円以外' },
  ];
};

export const PRESETS = {
  fukushiki1: {
    label: '「複式家計簿」（Android）の仕訳1',
    match: (columns) => columns.includes('貸借'),
    build: (columns) => ({
      ...emptyMapping(), shape: 'lines',
      rowNo: ['行番号'], date: ['仕訳日'], voucher: ['仕訳No'], memo: ['メモ'],
      account: ['科目名'], code: ['科目コード'], sub: ['補助科目名'], subCode: ['補助科目コード'], amount: ['金額'],
      sideMode: 'column', sideCol: ['貸借'], sideValues: { 借: 'dr', 貸: 'cr' },
      exclude: fukushikiExclude(columns),
    }),
  },
  fukushiki3: {
    label: '「複式家計簿」（Android）の仕訳3',
    match: (columns) => columns.includes('科目コード(借)'),
    build: (columns) => ({
      ...emptyMapping(), shape: 'pair',
      rowNo: ['行番号'], date: ['仕訳日'], voucher: ['仕訳No'], memo: ['メモ'],
      drAccount: ['科目名(借)'], drCode: ['科目コード(借)'], drSub: ['補助科目名(借)'], drSubCode: ['補助科目コード(借)'], drAmount: ['金額(借)'],
      crAccount: ['科目名(貸)'], crCode: ['科目コード(貸)'], crSub: ['補助科目名(貸)'], crSubCode: ['補助科目コード(貸)'], crAmount: ['金額(貸)'],
      exclude: fukushikiExclude(columns),
    }),
  },
  fukushikiKamoku: {
    label: '「複式家計簿」（Android）の科目',
    master: true,
    match: (columns) => columns.includes('補助簿'),
  },
  // 既存の CSV 取込（csv.js の normalizeForeignCsv）と同じ読み方
  mf: {
    label: 'マネーフォワード ME',
    match: (columns, text) => detectCsvFormat(text) === 'mf',
    build: () => ({
      ...emptyMapping(), shape: 'single',
      date: ['日付'], amount: ['金額(円)', '金額'], flowMode: 'sign',
      accountCol: ['保有金融機関', '金融機関'], category: ['大項目', '中項目'], memo: ['内容'],
      exclude: [{ col: ['計算対象'], values: ['0'], label: '計算対象外' }],
    }),
  },
  // Zaim の書き出しに「金額」の列は無い。金額は支出・収入・振替の3列（使わない列は 0）、
  // 口座は支払元（出金）・入金先（入金）に入る。既存の CSV 取込は「金額」の列を読むため、実際の Zaim では0件になる
  zaim: {
    label: 'Zaim',
    match: (columns, text) => detectCsvFormat(text) === 'zaim',
    build: () => ({
      ...emptyMapping(), shape: 'single',
      date: ['日付'], amount: ['支出', '収入', '振替'], flowMode: 'fromto',
      fromCol: ['支払元', '支出元'], toCol: ['入金先'], category: ['カテゴリ'], memo: ['品目', 'お店', 'メモ'],
    }),
  },
};

/** CSV の見出し（と本文）から決まった対応付けを探す。見つからなければ null */
export function detectPreset(columns, text) {
  for (const id of ['fukushiki1', 'fukushiki3', 'fukushikiKamoku', 'mf', 'zaim']) {
    if (PRESETS[id].match(columns, text)) return id;
  }
  return null;
}

/** 複式家計簿の科目ファイル → 組のキー → { name, subName, hidden }（補助科目1つにつき1行＝1組） */
export function parseKamoku(table) {
  const idx = {};
  table.columns.forEach((c, i) => { idx[c] = i; });
  const get = (cells, name) => (idx[name] == null ? '' : (cells[idx[name]] || '').trim());
  const master = {};
  for (const { cells } of table.rows) {
    const code = get(cells, '科目コード');
    if (!code) continue;
    master[`${code}|${normSub(get(cells, '補助科目コード'))}`] = {
      name: get(cells, '科目名'),
      subName: get(cells, '補助科目名'),
      hidden: get(cells, '非表示(科目)') === '1' || get(cells, '非表示(補助科目)') === '1',
    };
  }
  return master;
}
