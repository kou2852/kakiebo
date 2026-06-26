import { getItem } from '../lib/db.js';
import { seedDefaults } from './postConfirm.js';

/**
 * Cognito PostAuthentication トリガー（毎ログイン時に発火）。
 * 外部IdP(Google)ユーザーは PostConfirmation が発火しないため、
 * PROFILE が未作成なら初回ログイン時にデフォルト科目を投入する。
 * PROFILE が既にあれば何もしない（メール/パスワードユーザーは重複しない）。
 */
export async function handler(event) {
  const userId = event.request.userAttributes.sub;
  const profile = await getItem(userId, 'PROFILE');
  if (!profile) {
    await seedDefaults(userId, event.request.userAttributes.email);
  }
  return event;
}
