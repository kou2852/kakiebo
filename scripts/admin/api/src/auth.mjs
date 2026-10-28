// 管理者プール（Cognito）の ID トークンを検証する。追加のライブラリは使わず node:crypto で RS256 を確かめる。
import { createPublicKey, verify } from 'node:crypto';

const b64 = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/**
 * 検証器を作る。fetchJwks はテストで差し替える（既定は Cognito の公開鍵を取りに行く）。
 * 鍵は温かい間とっておき、知らない kid が来たときだけ取り直す（鍵の入れ替えに追いつく）。
 */
export function makeVerifier({ region, userPoolId, clientId, fetchJwks, now = () => Date.now() }) {
  const iss = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
  const load = fetchJwks || (async () => (await fetch(`${iss}/.well-known/jwks.json`)).json());
  let keys = null, loadedAt = 0;
  const keyOf = async (kid) => {
    // 取り直しは1分に1回まで（でたらめな kid を送り続けて Cognito を叩かせる呼び出しへの備え）
    if (!keys || (!keys.has(kid) && now() - loadedAt >= 60_000)) {
      loadedAt = now();
      const { keys: list } = await load();
      keys = new Map(list.map((k) => [k.kid, createPublicKey({ key: k, format: 'jwk' })]));
    }
    return keys.get(kid);
  };

  /** 有効なら claims、無効なら null（理由は外に出さない） */
  return async function verifyToken(token) {
    try {
      const parts = String(token || '').split('.');
      if (parts.length !== 3) return null;
      const header = JSON.parse(b64(parts[0]).toString('utf8'));
      if (header.alg !== 'RS256' || !header.kid) return null;
      const key = await keyOf(header.kid);
      if (!key) return null;
      const ok = verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), key, b64(parts[2]));
      if (!ok) return null;
      const c = JSON.parse(b64(parts[1]).toString('utf8'));
      if (c.iss !== iss || c.aud !== clientId || c.token_use !== 'id') return null;
      if (typeof c.exp !== 'number' || c.exp * 1000 <= now()) return null;
      return c;
    } catch { return null; }
  };
}
