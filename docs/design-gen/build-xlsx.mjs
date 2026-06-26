// スクショを埋め込んだ設計書 .xlsx を生成。Google Drive にアップ→「Googleスプレッドシートで開く」で利用。
import ExcelJS from 'exceljs';
import { readFileSync, existsSync } from 'node:fs';

const DIR = new URL('./', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const SHOTS = DIR + 'shots/';
const OUT = DIR + 'kurofukubo-design.xlsx';

const pngSize = (p) => { const b = readFileSync(p); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; };

const wb = new ExcelJS.Workbook();
wb.creator = 'kurofukubo';
wb.created = new Date();

const TITLE = { font: { bold: true, size: 14, color: { argb: 'FF6E521A' } } };
const H = { font: { bold: true, size: 11, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8A6A24' } } };
const KEY = { font: { bold: true }, alignment: { vertical: 'top' } };
const WRAP = { alignment: { wrapText: true, vertical: 'top' } };

// 表形式タブ: rows = [{h:[...]} ヘッダ | [key,val] | {t:'title'} | {s:'section title'}]
function tableSheet(name, colW, rows) {
  const ws = wb.addWorksheet(name, { views: [{ showGridLines: false }] });
  colW.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  let r = 1;
  for (const row of rows) {
    if (row.t) { const c = ws.getCell(r, 1); c.value = row.t; c.style = TITLE; r += 2; continue; }
    if (row.s) { ws.mergeCells(r, 1, r, colW.length); const c = ws.getCell(r, 1); c.value = row.s; c.style = H; r += 1; continue; }
    if (row.h) { row.h.forEach((v, i) => { const c = ws.getCell(r, i + 1); c.value = v; c.style = H; }); r += 1; continue; }
    row.forEach((v, i) => { const c = ws.getCell(r, i + 1); c.value = v; c.style = i === 0 ? KEY : WRAP; });
    r += 1;
  }
  return ws;
}

// ── 概要 ──
tableSheet('概要', [22, 90], [
  { t: 'kurofukubo（複式家計簿） 設計書' },
  ['更新日', '2026-06-12'],
  ['プロダクト', '複式簿記ベースの個人向け家計簿SaaS。資産・負債・収支を一画面で把握し、貸借対照表(BS)・損益計算書(PL)・キャッシュフロー計算書(CF)まで出力できる。'],
  ['アプリURL', 'https://app.kurofukubo.com'],
  ['LP URL', 'https://kurofukubo.com'],
  { s: '主要機能' },
  ['仕訳', '複式仕訳の入力（借方/貸方・税率・タグ・プリセット・クイック入力・CSV取込）'],
  ['レポート', 'ダッシュボード / 貸借対照表 / 損益計算書 / キャッシュフロー計算書 / 月次推移'],
  ['管理', '勘定科目・口座・タグ配分・予算・定期取引・自動分類ルール'],
  ['データ', 'JSONエクスポート/インポート（旧HTML版からの移行も可）'],
  { s: 'ティアと広告' },
  ['ティア', 'guest / free / pro / family（課金は未実装のため実ログインは全員 free）'],
  ['広告', 'Google AdSense。ゲスト=多め / Free=同配置で頻度低 / Pro・Family=なし。VITE_ADSENSE_SLOT 未設定時は非表示。'],
  { s: '技術スタック' },
  ['フロント', 'React 18 + Vite SPA（CSS変数テーマ・data-theme）'],
  ['バック', 'AWS SAM：Lambda(Node20/arm64) + API Gateway(REST) + DynamoDB + Cognito'],
  ['ホスティング', '非公開S3 + CloudFront(OAC) + ACM + Route53'],
  ['認証', 'Cognito（メール/パスワード SRP ＋ Google OAuth）＋ ゲスト(localStorage)'],
]);

// ── 画面別仕様（スクショ埋め込み）──
const screens = [
  ['00-login', 'ログイン / 新規登録', 'メール+パスワード、Googleログイン、「ゲストとして試す」、新規登録、パスワード再設定（お忘れですか？）への導線。'],
  ['01-dashboard', 'ダッシュボード', '期間選択、KPI（総資産/負債/純資産/収入/支出/収支）、資産構成・収入内訳・支出内訳の円グラフ、月次推移グラフ。ゲスト時は登録誘導カード/上部バナー。'],
  ['02-journal', '仕訳入力', '複式仕訳の入力。借方/貸方の行追加、勘定科目選択、金額、消費税率、タグ（明細分割）。借貸の一致をリアルタイム検証。'],
  ['03-ledger', '仕訳帳', '期間・キーワード検索・入金/出金フィルタ・各列ソート。仕訳の一覧と編集導線。'],
  ['04-bs', '貸借対照表 (BS)', '資産・負債・純資産の残高を区分別に集計表示。'],
  ['05-pl', '損益計算書 (PL)', '期間内の収益・費用・純利益を区分別に集計表示。'],
  ['06-cf', 'キャッシュフロー計算書', '簡易直接法によるキャッシュフローの集計。'],
  ['07-accounts', '勘定科目・口座管理', '科目（資産/負債/純資産/収益/費用タブ）、口座、入出金プリセット、自動分類ルールの管理。ゲストは新規作成に軽い上限。'],
  ['08-tags', 'タグ・配分', 'タグ一覧と残高、口座別のタグ配分をバーで可視化。'],
  ['09-calendar', 'カレンダー', '月次カレンダー上に日別の仕訳を表示。「今日」ボタンで当日へ復帰。'],
  ['10-recurring', '定期取引', '家賃・給与など周期取引の定義と次回発生日、自動生成。'],
  ['11-settings', 'バックアップ / 移行', '全データのJSONエクスポート/インポート。アカウント削除（全データ+認証情報を完全削除）。'],
  ['12-guide', '操作ガイド', 'アプリ内の使い方ガイド。'],
];

const wsS = wb.addWorksheet('画面別仕様', { views: [{ showGridLines: false }] });
wsS.getColumn(1).width = 120;
let r = 1;
wsS.getCell(r, 1).value = '画面別仕様（スクリーンショット）'; wsS.getCell(r, 1).style = TITLE; r += 2;
const DISP_W = 760;
for (const [file, title, desc] of screens) {
  const path = SHOTS + file + '.png';
  wsS.getCell(r, 1).value = '■ ' + title; wsS.getCell(r, 1).style = { font: { bold: true, size: 12 } }; r += 1;
  const dc = wsS.getCell(r, 1); dc.value = desc; dc.style = WRAP; wsS.getRow(r).height = 42; r += 2;
  if (existsSync(path)) {
    const { w, h } = pngSize(path);
    const dispH = Math.round(DISP_W * h / w);
    const id = wb.addImage({ filename: path, extension: 'png' });
    wsS.addImage(id, { tl: { col: 0, row: r - 1 }, ext: { width: DISP_W, height: dispH }, editAs: 'oneCell' });
    r += Math.ceil(dispH / 20) + 2;
  } else {
    wsS.getCell(r, 1).value = '(screenshot missing: ' + file + ')'; r += 2;
  }
}

// ── データモデル ──
tableSheet('データモデル', [26, 86], [
  { t: 'データモデル' },
  { s: 'localStorage（kk4 / ゲストは kk4_guest）' },
  ['accounts', '{id, code, name, type(asset|liability|equity|income|expense), sys}'],
  ['journals', '{id, date(YYYY-MM-DD), desc, lines:[{accountId, side(dr|cr), amount, taxRate, splits}]}'],
  ['tags / wallets', 'tags:{id,name,color,note} / wallets:{id,name,accountId,defaultTagName,defaultTagColor}'],
  ['budgets / allocs', 'budgets:{accountId,amount} / allocs:{accountId,tagId,amount}'],
  ['presets / recurring / rules', 'プリセット入力 / 定期取引 / キーワード自動分類'],
  { s: 'DynamoDB（シングルテーブル: kakeibo-prod）' },
  ['PK / SK', 'PK = USER#<cognito sub>、SK = JOURNAL#/ACCOUNT#/TAG#/WALLET#/BUDGET#/PRESET#/RECURRING#/RULE#/ALLOC#/PROFILE'],
  ['GSI1', 'PK 同一・GSI1SK = date（仕訳の日付範囲検索用）'],
  ['分離', 'PK にユーザーの sub を用いてテナント分離。サーバー側でキーを権威的に付与しクライアント値は信頼しない。'],
]);

// ── API ──
tableSheet('API仕様', [34, 16, 50], [
  { t: 'API 仕様（prod: https://ecbjdndcbe.execute-api.ap-northeast-1.amazonaws.com/prod）' },
  { h: ['パス', 'メソッド', '説明'] },
  ['/api/journals', 'GET/POST', '仕訳一覧（?start&end で期間）/ 作成（借貸一致・日付形式・摘要長を検証）'],
  ['/api/journals/{id}', 'PUT/DELETE', '仕訳の更新 / 削除'],
  ['/api/accounts', 'GET/POST', '勘定科目 一覧 / 作成（名称100・コード30・備考300字の上限）'],
  ['/api/accounts/{id}', 'PUT/DELETE', '科目の更新 / 削除（システム科目は不可）'],
  ['/api/tags /api/wallets /api/budgets', 'GET/POST', 'タグ / 口座 / 予算 の取得・保存（長さ検証）'],
  ['/api/export', 'GET', '全データ一括取得'],
  ['/api/import', 'POST', '全データ一括復元（件数上限10000、キーはサーバーで再付与）'],
  ['/api/account', 'DELETE', 'アカウント削除（全データ + Cognitoユーザーを削除）'],
  ['(共通)', '—', '認証=Cognito JWT（Authorization: Bearer）。OPTIONS は認証不要でCORS応答。'],
]);

// ── インフラ ──
tableSheet('インフラ', [24, 86], [
  { t: 'インフラ構成（AWS）' },
  ['アカウント', '管理 885418708508 / dev 296391867332 / prod 117953360790（Organizations + IAM Identity Center）'],
  { s: 'prod' },
  ['バックエンド', 'スタック kakeibo-saas-prod（ap-northeast-1）'],
  ['API', 'https://ecbjdndcbe.execute-api.ap-northeast-1.amazonaws.com/prod'],
  ['DynamoDB', 'kakeibo-prod（PITR有効・PAY_PER_REQUEST）'],
  ['Cognito', 'UserPool ap-northeast-1_ddBDF3HKK / Client lprqfuad5gm32gkb4g2bkvebk / Hosted UI kurofukubo-auth-prod'],
  ['アプリ配信', 'CloudFront E32HZNCIT2MXUM / S3 kakeibo-web-prod-117953360790（証明書 us-east-1）'],
  ['LP配信', 'CloudFront E2ANL068WDF75Y / S3 kakeibo-lp-117953360790 / スタック kakeibo-lp-prod（us-east-1）'],
  ['Route53', 'Z0591546DS1L9CEG542K（kurofukubo.com）'],
  { s: '監視' },
  ['アラート', 'CloudWatch Alarms（Lambda Errors / API 5XX / DynamoDB throttle）→ SNS メール通知'],
  ['ダッシュボード', 'CloudWatch kakeibo-prod-ops（API流量/エラー/レイテンシ、Lambda、DynamoDB、Cognito サインイン/登録）'],
]);

// ── セキュリティ ──
tableSheet('セキュリティ', [24, 86], [
  { t: 'セキュリティ' },
  ['認証/認可', 'Cognito JWT 検証。PK=USER#sub でテナント分離。OPTIONS以外は要認証。'],
  ['入力検証', '借貸一致、必須/型、文字列長（摘要200/名称100/コード30/備考300）、日付 YYYY-MM-DD、import 件数上限10000。'],
  ['機密管理', 'Google client_secret は SSM SecureString。トラッキングファイルに保存しない。'],
  ['配信', '非公開S3 + CloudFront OAC、HTTPS強制、Managed-SecurityHeadersPolicy（HSTS/nosniff/X-Frame-Options/Referrer-Policy）。'],
  ['CSP', '未適用（AdSense/Cognito/OAuth の許可リスト整備後に Report-Only から導入予定）。'],
  ['アカウント削除', 'DELETE /api/account で全DynamoDBデータ + Cognitoユーザーを完全削除。'],
  ['ゲスト', 'localStorage(kk4_guest)のみ・API不送信。新規作成に軽い上限（タグ/口座/科目 各5件）。'],
  ['メール', 'Cognito 経由の確認/再設定メール。SES本番アクセス承認後に独自ドメイン送信（現状はサンドボックス）。'],
]);

await wb.xlsx.writeFile(OUT);
console.log('WROTE', OUT);
