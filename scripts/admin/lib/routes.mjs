// 画面が呼ぶ API の振り分け。手元の server.mjs と管理アプリ用の Lambda（api/src/handler.mjs）が共有する。
// 入口ごとの違い（Host・Origin・トークンの確認）は呼ぶ側で済ませてから route() に渡す。

import {
  getStats, getStatus, getToday, getPlatforms, getActive, getUsage, getInquiries, replyInquiry, getFeedback, getDeletions,
} from './reads.mjs';
import { jstStamp } from './cache.mjs';

/** 期間: from / to（日本時間の暦日）があればそれ、なければ直近 days 日 */
export function specOf(params) {
  const days = Math.min(180, Math.max(1, Number(params.get('days')) || 14));
  return params.get('from') && params.get('to') ? { from: params.get('from'), to: params.get('to') } : { days };
}

const GETS = {
  '/api/status': (sp, fresh) => getStatus(fresh),
  '/api/today': (sp, fresh) => getToday(fresh),
  '/api/stats': (sp, fresh) => getStats(specOf(sp), fresh),
  '/api/platforms': (sp, fresh) => getPlatforms(specOf(sp), fresh),
  '/api/active': (sp, fresh) => getActive(fresh),
  '/api/usage': (sp, fresh) => getUsage(fresh),
  '/api/inquiries': (sp, fresh) => getInquiries(fresh),
  '/api/feedback': (sp, fresh) => getFeedback(fresh),
  '/api/deletions': (sp, fresh) => getDeletions(fresh),
};
export const GET_PATHS = Object.keys(GETS);

/**
 * 要求を処理して { status, body } を返す。該当しなければ null。
 * hideIps: 公開の入口（Lambda）では自分IPの一覧を返さない
 */
export async function route(method, pathname, params, rawBody, { hideIps = false } = {}) {
  if (method === 'GET' && GETS[pathname]) {
    try {
      const { value, fetchedAt, cached } = await GETS[pathname](params, params.get('fresh') === '1');
      const body = { ...value, generatedAt: jstStamp(fetchedAt), fetchedAt, cached };
      if (hideIps && 'selfIps' in body) body.selfIps = null;
      return { status: 200, body };
    } catch (e) { return { status: 500, body: { error: e.message } }; }
  }
  // 本番への唯一の書き込み
  if (method === 'POST' && pathname === '/api/inquiry-reply') {
    try {
      const b = JSON.parse(rawBody || '{}');
      if (!b.table || !b.pk || !b.sk || !String(b.body || '').trim()) throw new Error('table / pk / sk / body が必要です');
      return { status: 200, body: await replyInquiry(b.table, b.pk, b.sk, String(b.body).trim().slice(0, 2000), !!b.close) };
    } catch (e) { return { status: 500, body: { error: e.message } }; }
  }
  return null;
}
