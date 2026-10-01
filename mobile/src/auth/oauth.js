// Cognito Hosted UI を使った外部IdPログイン（認可コード + PKCE）。Google と Apple。
// frontend/src/auth/oauth.js の移植。相違点は2つだけ:
//   - リダイレクト先がアプリのスキーム（kurofukubo://auth）
//   - ブラウザは ASWebAuthenticationSession（システムのSafari）を使う。
//     Google は埋め込み WebView での認証を拒否する（disallowed_useragent）ため、
//     アプリ内 WebView で代用することはできない。
//
// Apple は App Store Guideline 4.8 のために要る。Google のような外部ログインを出すなら、
// 「メールアドレスを伏せたままアカウントを作れる」選択肢を併設しなければならない。
// Apple の Hide My Email だけがこれを満たす（自前のメール+パスワードは確認コードのために
// 実在のアドレスを要求するので満たせない）。Google を外すのではなく Apple を足して解決する。
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { digestStringAsync, CryptoDigestAlgorithm, CryptoEncoding, getRandomBytes } from 'expo-crypto';
import { ENVIRONMENTS } from '../config';

WebBrowser.maybeCompleteAuthSession();

// Cognito 側のプロバイダ名。Apple の 'SignInWithApple' は Cognito の予約名で、変更できない。
export const IDP = { google: 'Google', apple: 'SignInWithApple' };

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

async function store(env, tok, prev, idp) {
  const rec = {
    id: tok.id_token,
    access: tok.access_token,
    // refresh_token は初回交換時のみ返るので前回分を引き継ぐ
    refresh: tok.refresh_token || prev?.refresh,
    exp: Date.now() + (tok.expires_in - 60) * 1000,
    // どちらで入ったか。復元したときの表示に使う。
    idp: idp || prev?.idp || 'google',
  };
  await AsyncStorage.setItem(key(env), JSON.stringify(rec));
  return rec;
}

export const clearOAuth = (env) => AsyncStorage.removeItem(key(env));

/**
 * Cognito 側のログインの記録（ログイン用ブラウザのクッキー）を消す。ウェブ版のログアウトと同じく /logout を通す。
 * ⚠ これをしないと、ログアウトしても Cognito の記録が残り、次の Google ログインが Google の画面を通らずに
 *   前のアカウントで即座に終わる（別のアカウントを選べない。2026-10-01 に iPhone で確認）。
 * ログインの画面と同じ認証用ブラウザで開く（クッキーの置き場が同じでないと消せない）。失敗してもログアウトは止めない。
 */
export async function logoutIdp(env) {
  try {
    const u = new URL(`${domain(env)}/logout`);
    u.searchParams.set('client_id', ENVIRONMENTS[env].clientId);
    u.searchParams.set('logout_uri', redirectUri);
    await WebBrowser.openAuthSessionAsync(u.toString(), redirectUri);
  } catch { /* 通信できなくても、端末のログイン情報は消す */ }
}
export const hasOAuthSession = async (env) => !!(await read(env));

/** 保存済みセッションがどちらの IdP のものか。'google' | 'apple' | null。 */
export async function oauthProvider(env) {
  const rec = await read(env);
  // idp を持たない古い記録は Google（Apple を足す前は Google しか無かった）。
  return rec ? (rec.idp || 'google') : null;
}

async function tokenRequest(env, body) {
  const res = await fetch(`${domain(env)}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
  if (!res.ok) throw new Error(`トークンの取得に失敗しました (${res.status})`);
  return res.json();
}

/** 外部IdPでログイン。which は 'google' | 'apple'。成功したら ID トークンを返す。 */
export async function loginWithIdp(env, which) {
  const state = hex(16);
  const verifier = hex(32);

  const u = new URL(`${domain(env)}/oauth2/authorize`);
  u.searchParams.set('identity_provider', IDP[which]);
  // Google は毎回アカウントを選ばせる。無いと端末・ブラウザの Google アカウントで勝手に進み、別のアカウントで入れない。
  // Cognito がこれを Google へ渡すのはマネージドログイン（ドメインの ManagedLoginVersion: 2）のときだけ（2026-10-01）
  if (which === 'google') u.searchParams.set('prompt', 'select_account');
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
  const rec = await store(env, tok, null, which);
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
