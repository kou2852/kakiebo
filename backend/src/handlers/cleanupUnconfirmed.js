// 確認されないまま放置されたサインアップを削除する（1日1回・EventBridge から起動）。
//
// 残しておくと、本人が同じメールアドレスで登録し直せない（「既に登録されています」で詰む）。
// つまりこれは掃除ではなく、確認コードが届かなかった人の復旧手段でもある。
//
// Cognito の確認コード自体は24時間で失効するので、それより余裕を持たせて3日で消す。
import {
  CognitoIdentityProviderClient, ListUsersCommand, AdminDeleteUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';

const cognito = new CognitoIdentityProviderClient({});
const POOL_ID = process.env.USER_POOL_ID;
const KEEP_DAYS = Number(process.env.UNCONFIRMED_KEEP_DAYS || 3);

export async function handler() {
  if (!POOL_ID) throw new Error('USER_POOL_ID が未設定です');
  const cutoff = Date.now() - KEEP_DAYS * 86400000;

  // ListUsers の Filter は前方一致しか使えないため、状態での絞り込みはここで行う。
  const targets = [];
  let token;
  do {
    const page = await cognito.send(new ListUsersCommand({
      UserPoolId: POOL_ID, Limit: 60, PaginationToken: token,
    }));
    for (const u of page.Users || []) {
      if (u.UserStatus !== 'UNCONFIRMED') continue;
      if (new Date(u.UserCreateDate).getTime() >= cutoff) continue;
      targets.push(u.Username);
    }
    token = page.PaginationToken;
  } while (token);

  let deleted = 0;
  for (const Username of targets) {
    try {
      await cognito.send(new AdminDeleteUserCommand({ UserPoolId: POOL_ID, Username }));
      deleted++;
    } catch (e) {
      // 1件の失敗で全体を止めない。次回の実行で拾える。
      console.error('CLEANUP_UNCONFIRMED_FAILED', JSON.stringify({ error: e?.name || 'unknown' }));
    }
  }

  // メールアドレス等は出さない。件数だけ残す（ログから個人が特定できないようにする）。
  console.log('CLEANUP_UNCONFIRMED', JSON.stringify({ found: targets.length, deleted, keepDays: KEEP_DAYS }));
  return { found: targets.length, deleted };
}
