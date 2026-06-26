// E2E暗号コアの検証（Node の Web Crypto を使用）
import { setupEncryption, unlock, recover, changePassphrase, seal, open } from '../../frontend/src/utils/crypto.js';

const ok = (label, cond) => console.log((cond ? 'PASS' : 'FAIL') + ' — ' + label);
let pass = true; const must = (l, c) => { if (!c) pass = false; ok(l, c); };

const run = async () => {
  const secret = { date: '2026-06-16', desc: '家賃', lines: [{ accountId: 'e09', side: 'dr', amount: 80000 }] };

  // セットアップ
  const { dek, recoveryKey, bundle } = await setupEncryption('correct horse battery staple');
  must('bundle に平文鍵が含まれない (wrappedDEKのみ)', !!bundle.wrappedDEK && !bundle.dek && !bundle.passphrase);
  must('リカバリーキーが生成される', typeof recoveryKey === 'string' && recoveryKey.length >= 10);

  // 封緘→開封（同一DEK）
  const blob = await seal(dek, secret);
  const back = await open(dek, blob);
  must('seal→open でラウンドトリップ一致', JSON.stringify(back) === JSON.stringify(secret));
  must('暗号文に平文が出ない', !blob.includes('家賃') && !blob.includes('80000'));

  // 正しいパスフレーズで解錠 → 同じデータが読める
  const dek2 = await unlock('correct horse battery staple', bundle);
  must('正しいパスフレーズで解錠し復号できる', JSON.stringify(await open(dek2, blob)) === JSON.stringify(secret));

  // 誤ったパスフレーズは失敗する
  let wrongFailed = false;
  try { await unlock('wrong passphrase', bundle); } catch { wrongFailed = true; }
  must('誤ったパスフレーズは解錠失敗（例外）', wrongFailed);

  // リカバリーキーで解錠
  const dek3 = await recover(recoveryKey, bundle);
  must('リカバリーキーで復号できる', JSON.stringify(await open(dek3, blob)) === JSON.stringify(secret));

  // パスフレーズ変更（再ラップのみ、データ再暗号化不要）
  const bundle2 = await changePassphrase(dek, 'a brand new passphrase', bundle);
  const dek4 = await unlock('a brand new passphrase', bundle2);
  must('変更後の新パスフレーズで復号できる（既存blobそのまま）', JSON.stringify(await open(dek4, blob)) === JSON.stringify(secret));
  let oldFailed = false;
  try { await unlock('correct horse battery staple', bundle2); } catch { oldFailed = true; }
  must('変更後は旧パスフレーズで解錠失敗', oldFailed);

  console.log(pass ? '\nALL PASS' : '\nSOME FAILED');
  if (!pass) process.exit(1);
};
run().catch((e) => { console.error('ERROR', e); process.exit(1); });
