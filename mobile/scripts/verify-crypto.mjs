// Web 版（Web Crypto API）で作った暗号文を、モバイル版（@noble）が復号できるかの検証。
// webcrypto-vector.json は frontend/src/utils/crypto.js で実際に暗号化して作った固定ベクタ。
// 実行: node scripts/verify-crypto.mjs
import { readFileSync } from 'node:fs';
import { unlock, open, seal, setupEncryption, recover, changePassphrase, PARAMS } from '../src/crypto/index.js';

const v = JSON.parse(readFileSync(new URL('../src/crypto/webcrypto-vector.json', import.meta.url), 'utf8'));
let failed = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${name}${extra ? '  ' + extra : ''}`);
  if (!ok) failed++;
};

// 1. Web 版の bundle をモバイル版で解錠できるか
const t0 = Date.now();
const dek = await unlock(v.passphrase, v.bundle);
const kdfMs = Date.now() - t0;
check('Web 版 bundle の解錠', dek.length === PARAMS.KEY_LEN, `DEK ${dek.length}B / PBKDF2 ${kdfMs}ms`);

// 2. Web 版の暗号文をモバイル版で復号できるか（本丸）
const plain = open(dek, v.ct);
check('Web 版 暗号文の復号', JSON.stringify(plain) === JSON.stringify(v.expectedPlaintext));

// 3. 誤ったパスフレーズは必ず失敗すること
let rejected = false;
try { await unlock(v.passphrase + 'x', v.bundle); } catch { rejected = true; }
check('誤パスフレーズの拒否', rejected);

// 4. モバイル版だけで一周（作成→解錠→リカバリー→パス変更）
const s = await setupEncryption('mobile-pass');
const blob = seal(s.dek, { hello: 'こんにちは', n: 1200 });
check('自前ラウンドトリップ', open(await unlock('mobile-pass', s.bundle), blob).hello === 'こんにちは');
check('リカバリーキー', Buffer.from(await recover(s.recoveryKey, s.bundle)).equals(Buffer.from(s.dek)));
const b2 = await changePassphrase(s.dek, 'new-pass', s.bundle);
check('パスフレーズ変更', Buffer.from(await unlock('new-pass', b2)).equals(Buffer.from(s.dek)));

process.exit(failed ? 1 : 0);
