// Cognito Hosted UI を使った Google ログイン（認可コード + PKCE）。
// frontend/src/auth/oauth.js の移植。相違点は2つだけ:
//   - リダイレクト先がアプリのスキーム（kurofukubo://auth）
//   - ブラウザは ASWebAuthenticationSession（システムのSafari）を使う。
//     Google は埋め込み WebView での認証を拒否する（disallowed_useragent）ため、
//     アプリ内 WebView で代用することはできない。
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { digestStringAsync, CryptoDigestAlgorithm, CryptoEncoding, getRandomBytes } from 'expo-crypto';
import { ENVIRONMENTS } from '../config';

WebBrowser.maybeCompleteAuthSession();

const key = (env) => `kk_oauth_${env}`;
const domain = (env) => ENVIRONMENTS[env].authDomain;

/** アプリに戻ってくる先。dev build / 製品版では kurofukubo://auth で固定。 */
export const redirectUri = AuthSession.makeRedirectUri({ scheme: 'kurofukubo', path: 'auth' });

const hex = (n) => Array.from(getRandomBytes(n), (b) => b.toString(16).padStart(2, '0')).join('');

async function challengeFor(verifier) {
  const b64 = await digestStringAsync(CryptoDigestAlgorithm.SHA256, verifier, { encoding: CryptoEncoding.BASE64 });
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function read(env) {
  try { return JSON.parse(await AsyncStorage.getItem(key(env))); } catch { return null; }
}

async function store(env, tok, prev) {
  const rec = {
    id: tok.id_token,
    access: tok.access_token,
    // refresh_token は初回交換時のみ返るので前回分を引き継ぐ
    refresh: tok.refresh_token || prev?.refresh,
    exp: Date.now() + (tok.expires_in - 60) * 1000,
  };
  await AsyncStorage.setItem(key(env), JSON.stringify(rec));
  return rec;
}

export const clearOAuth = (env) => AsyncStorage.removeItem(key(env));
export const hasOAuthSession = async (env) => !!(await read(env));

async function tokenRequest(env, body) {
  const res = await fetch(`${domain(env)}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
  if (!res.ok) throw new Error(`トークンの取得に失敗しました (${res.status})`);
  return res.json();
}

/** Google でログイン。成功したら ID トークンを返す。 */
export async function loginWithGoogle(env) {
  const state = hex(16);
  const verifier = hex(32);

  const u = new URL(`${domain(env)}/oauth2/authorize`);
  u.searchParams.set('identity_provider', 'Google');
  u.searchParams.set('client_id', ENVIRONMENTS[env].clientId);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', 'email openid profile');
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('state', state);
  u.searchParams.set('code_challenge_method', 'S256');
  u.searchParams.set('code_challenge', await challengeFor(verifier));

  const result = await WebBrowser.openAuthSessionAsync(u.toString(), redirectUri);
  if (result.type !== 'success') throw new Error('ログインが中断されました');

  const params = new URL(result.url).searchParams;
  // 自分が開始したフローでなければコードを使わない（CSRF対策）
  if (params.get('state') !== state) throw new Error('state が一致しません');
  const code = params.get('code');
  if (!code) throw new Error(params.get('error_description') || '認可コードが返りませんでした');

  const tok = await tokenRequest(env, {
    grant_type: 'authorization_code',
    client_id: ENVIRONMENTS[env].clientId,
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });
  const rec = await store(env, tok, null);
  return rec.id;
}

/** 有効な ID トークンを返す（期限切れなら refresh）。なければ null。 */
export async function getOAuthIdToken(env) {
  const rec = await read(env);
  if (!rec) return null;
  if (Date.now() < rec.exp) return rec.id;
  if (!rec.refresh) { await clearOAuth(env); return null; }
  try {
    const tok = await tokenRequest(env, {
      grant_type: 'refresh_token',
      client_id: ENVIRONMENTS[env].clientId,
      refresh_token: rec.refresh,
    });
    return (await store(env, tok, rec)).id;
  } catch {
    await clearOAuth(env);
    return null;
  }
}
