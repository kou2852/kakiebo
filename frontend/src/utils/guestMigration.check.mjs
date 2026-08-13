/**
 * ゲストデータ移行の判定チェック。
 *   node src/utils/guestMigration.check.mjs
 *
 * 2026-08 に、ゲスト画面を開いたことのある既存利用者がログインすると、
 * ゲスト側の既定科目29件がサーバーへ送られ、変更済みの科目名・コードが
 * 既定値に戻る障害が起きた（実被害2件）。要件は2つ。
 *   1. 既存アカウントへは移行しない
 *   2. 万一移行しても、固定IDの既定データは送らない（送れば上書きになる）
 * 1が判定を1つでも取りこぼすと壊れるため、2を下支えとして併せて検証する。
 */
import {
  DEFAULT_ACCOUNTS, DEFAULT_PRESETS,
  stripSeedDefaults, hasGuestContent, isExistingAccount, planGuestMigration,
} from './guestMigration.js';

let ng = 0;
const t = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) ng++;
  console.log(`${ok ? '  ok  ' : '  NG  '}${name}  → ${JSON.stringify(got)}（期待 ${JSON.stringify(want)}）`);
};

/** 新規登録直後のサーバー状態（seedDefaults が入れた分だけ） */
const seeded = () => ({
  accounts: DEFAULT_ACCOUNTS.map((a) => ({ ...a })),
  presets: DEFAULT_PRESETS.map((p) => ({ ...p })),
  journals: [], tags: [], wallets: [], budgets: [], recurring: [], rules: [], allocs: [],
});

/** ゲスト画面を開いただけの状態。記帳ゼロでも既定29件＋プリセット3件が入る */
const guestUntouched = () => seeded();

/** サーバー取得を数えるスタブ。判定に不要なときは呼ばれないことも確認する */
const stubServer = (data) => {
  const fn = async () => { fn.calls++; return data; };
  fn.calls = 0;
  return fn;
};

console.log('■ isExistingAccount — 新規と既存の見分け');
t('新規（シードそのまま）', isExistingAccount(seeded()), false);
{ const d = seeded(); d.journals = [{ id: 'j1' }]; t('記帳あり', isExistingAccount(d), true); }
{ const d = seeded(); d.wallets = [{ id: 'w1' }]; t('口座を1件だけ作成', isExistingAccount(d), true); }
{ const d = seeded(); d.allocs = [{ accountId: 'a01', tagId: 't1' }]; t('タグ配分のみ', isExistingAccount(d), true); }
{ const d = seeded(); d.accounts.push({ id: 'm8k2ab', code: '1010', name: 'PayPay', sys: 0 }); t('科目を追加', isExistingAccount(d), true); }
{ const d = seeded(); d.accounts.find((a) => a.id === 'a02').name = '現金２'; t('既定科目を改名（未記帳）', isExistingAccount(d), true); }
{ const d = seeded(); d.accounts.find((a) => a.id === 'b04').code = '2102'; t('既定科目のコード変更', isExistingAccount(d), true); }
{ const d = seeded(); d.accounts = d.accounts.filter((a) => a.id !== 'a02'); t('既定科目を削除', isExistingAccount(d), true); }
{ const d = seeded(); d.presets = []; t('プリセットが空（判定に使わない）', isExistingAccount(d), false); }

console.log('■ stripSeedDefaults — 固定IDは送らない');
{
  const p = stripSeedDefaults(guestUntouched());
  t('既定科目を除去', p.accounts.length, 0);
  t('既定プリセットを除去', p.presets.length, 0);
  t('送る中身なし', hasGuestContent(p), false);
}
{
  const g = guestUntouched();
  g.accounts.push({ id: 'm8k2ab', code: '1010', name: '楽天銀行', sys: 0 });
  g.journals = [{ id: 'j1', date: '2026-08-01', lines: [{ accountId: 'a01', side: 'dr', amount: 100 }] }];
  const p = stripSeedDefaults(g);
  t('ゲスト追加科目は残る', p.accounts.map((a) => a.id), ['m8k2ab']);
  t('仕訳は残る', p.journals.length, 1);
  t('固定IDが1件も残らない', p.accounts.some((a) => /^[a-e]\d\d$/.test(a.id)), false);
}

console.log('■ planGuestMigration — 実際の分岐');
{
  const fs = stubServer(seeded());
  const r = await planGuestMigration({ guest: null, encBundle: null, fetchServer: fs });
  t('ゲストデータ無し → 移行しない', r.migrate, false);
  t('  サーバーを取りに行かない', fs.calls, 0);
}
{
  const fs = stubServer(seeded());
  const r = await planGuestMigration({ guest: guestUntouched(), encBundle: { kdf: 'x' }, fetchServer: fs });
  t('E2E利用者 → 移行しない', r.migrate, false);
  t('  サーバーを取りに行かない（平文は空に見えるため）', fs.calls, 0);
}
{
  const server = seeded(); server.journals = [{ id: 'j1' }];
  const fs = stubServer(server);
  const r = await planGuestMigration({ guest: guestUntouched(), encBundle: null, fetchServer: fs });
  t('記帳済みの既存 → 移行しない', r.migrate, false);
  t('  取得済みの内容を返す（再取得させない）', r.served !== null, true);
}
{
  // 今回の障害そのもの。改名済みで未記帳の既存利用者がゲスト画面を開いてログインした
  const server = seeded();
  server.accounts.find((a) => a.id === 'a02').name = '現金２';
  server.accounts.find((a) => a.id === 'b04').code = '2102';
  const r = await planGuestMigration({ guest: guestUntouched(), encBundle: null, fetchServer: stubServer(server) });
  t('改名済み・未記帳の既存 → 移行しない', r.migrate, false);
}
{
  const r = await planGuestMigration({ guest: guestUntouched(), encBundle: null, fetchServer: stubServer(seeded()) });
  t('新規＋ゲストは既定のみ → 移行しない', r.migrate, false);
}
{
  const g = guestUntouched();
  g.accounts.push({ id: 'm8k2ab', code: '1010', name: '楽天銀行', sys: 0 });
  g.journals = [{ id: 'j1' }];
  const r = await planGuestMigration({ guest: g, encBundle: null, fetchServer: stubServer(seeded()) });
  t('新規＋ゲストに実データ → 移行する', r.migrate, true);
  t('  送るのは追加科目だけ', r.payload.accounts.map((a) => a.id), ['m8k2ab']);
  t('  仕訳も送る', r.payload.journals.length, 1);
  t('  取得済みは捨てて読み直させる', r.served, null);
}

console.log(ng === 0 ? '\n全て期待どおり' : `\n${ng}件が期待と異なる`);
process.exit(ng ? 1 : 0);
