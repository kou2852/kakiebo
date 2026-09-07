// マージが「消さない」ことの検証。 node src/store/merge.check.mjs
//
// データ消失は本アプリで最も重い事故なので、口頭の確認ではなくここで固定する。
// 2026-09-07、ゲストで記帳した端末が Apple / Google でのアカウント作成時に
// 帳簿ごと消える経路が見つかったことを受けて追加した。
import { COLLECTIONS, codeCollisions, diffSummary, hasContent, mergeDatasets } from './merge.js';
import { emptyDataset } from '../db/defaults.js';

let ng = 0;
const check = (name, ok) => { console.log((ok ? '  ok   ' : '  NG   ') + name); if (!ok) ng++; };
const ids = (ds, c) => new Set((ds[c] || []).map((x) => x.id));

const guest = emptyDataset();
guest.journals = [
  { id: 'j1', date: '2026-09-01', desc: 'ゲストの記帳', lines: [] },
  { id: 'j2', date: '2026-09-02', desc: 'ゲストの記帳2', lines: [] },
];
guest.accounts = guest.accounts.map((a) => (a.id === 'a01' ? { ...a, name: '財布' } : a));

const server = emptyDataset();            // 新規アカウント＝既定26科目のみ
const serverUsed = emptyDataset();
serverUsed.journals = [{ id: 's1', date: '2026-08-01', desc: 'サーバーの記帳', lines: [] }];

console.log('hasContent');
check('初期状態は空とみなす', hasContent(emptyDataset()) === false);
check('新規アカウントのサーバーも空', hasContent(server) === false);
check('仕訳があれば中身あり', hasContent(guest) === true);
check('科目を1件足せば中身あり', hasContent({ ...emptyDataset(), accounts: [...emptyDataset().accounts, { id: 'x9' }] }) === true);

console.log('mergeDatasets: どちらを正にしても片方にしか無いものは消えない');
for (const prefer of ['local', 'server']) {
  const m = mergeDatasets(serverUsed, guest, prefer);
  check(`  [${prefer}] ゲストの仕訳2件が残る`, ids(m, 'journals').has('j1') && ids(m, 'journals').has('j2'));
  check(`  [${prefer}] サーバーの仕訳が残る`, ids(m, 'journals').has('s1'));
  check(`  [${prefer}] 科目は既定件数のまま（IDが一致し重複しない）`, m.accounts.length === emptyDataset().accounts.length);
  for (const c of COLLECTIONS) {
    const lost = [...ids(guest, c), ...ids(serverUsed, c)].filter((id) => !ids(m, c).has(id));
    check(`  [${prefer}] ${c}: 消えたIDが無い`, lost.length === 0);
  }
}

console.log('mergeDatasets: 衝突は prefer 側が勝つ');
check('local を正にすると端末の名前', mergeDatasets(serverUsed, guest, 'local').accounts.find((a) => a.id === 'a01').name === '財布');
check('server を正にするとサーバーの名前', mergeDatasets(serverUsed, guest, 'server').accounts.find((a) => a.id === 'a01').name === '現金');

console.log('diffSummary');
const dsum = diffSummary(serverUsed, guest);
check('端末だけ 2件（j1,j2）', dsum.onlyLocal === 2);
check('サーバーだけ 1件（s1）', dsum.onlyServer === 1);
check('衝突 1件（a01 の名前）', dsum.conflict === 1);

console.log('codeCollisions: 別IDで同じコードを拾う');
{
  const srv = { accounts: [{ id: 's1', code: '1004', name: 'サブ口座', type: 'asset' }] };
  const loc = { accounts: [{ id: 'l1', code: '1004', name: 'TestAsset', type: 'asset' },
    { id: 'l2', code: '1005', name: '別物', type: 'asset' }] };
  const m = mergeDatasets(srv, loc, 'local');
  const dup = codeCollisions(m, srv, loc);
  check('衝突は1組だけ', dup.length === 1);
  check('コードは 1004', dup[0]?.code === '1004');
  check('両方が挙がる（どちらも消えていない）', dup[0]?.items.length === 2);
  check('出どころが分かる（local と server）',
    dup[0]?.items.some((x) => x.side === 'local') && dup[0]?.items.some((x) => x.side === 'server'));
  check('重複していないコードは挙げない', !dup.some((x) => x.code === '1005'));
  check('マージ結果に3件とも残っている（衝突しても消さない）', m.accounts.length === 3);
}

console.log('codeCollisions: 既定の初期状態では衝突ゼロ');
check('既定同士でぶつからない', codeCollisions(emptyDataset(), emptyDataset(), emptyDataset()).length === 0);

console.log(ng ? `\n${ng} 件 NG` : '\nすべて通過');
process.exit(ng ? 1 : 0);
