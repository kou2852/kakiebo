// Cognito Hosted UI を使った OAuth (認可コード) フロー。
// メール/パスワード(SRP) は従来どおり amazon-cognito-identity-js を使い、
// Google ログインのみこのリダイレクトフローを使う。

const DOMAIN = import.meta.env.VITE_COGNITO_DOMAIN;      // https://kurofukubo-auth-xxx.auth.<region>.amazoncognito.com
const CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID;
const REDIRECT = typeof window !== 'undefined' ? window.location.origin : ''; // = Cognito の CallbackURL (AllowedOrigin)
const TKEY = 'kk_oauth';

export const OAUTH_ENABLED = !!DOMAIN && !!CLIENT_ID;

function read() {
  try { return JSON.parse(localStorage.getItem(TKEY)); } catch { return null; }
}

function store(tok) {
  const prev = read();
  const rec = {
    id: tok.id_token,
    access: tok.access_token,
    // refresh_token は初回交換時のみ返るので前回分を引き継ぐ
    refresh: tok.refresh_token || prev?.refresh,
    exp: Date.now() + (tok.expires_in - 60) * 1000,
  };
  localStorage.setItem(TKEY, JSON.stringify(rec));
  return rec;
}

export function hasOAuthSession() {
  return !!read();
}

export function clearOAuth() {
  localStorage.removeItem(TKEY);
}

// ── CSRF対策(state) + 認可コード横取り対策(PKCE S256) ──
const STATE_KEY = 'kk_oauth_state';
const VERIFIER_KEY = 'kk_oauth_verifier';

function randomString(bytes = 32) {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Base64Url(str) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function loginWithGoogle() {
  const state = randomString(16);
  const verifier = randomString(32);
  sessionStorage.setItem(STATE_KEY, state);
  sessionStorage.setItem(VERIFIER_KEY, verifier);

  const u = new URL(`${DOMAIN}/oauth2/authorize`);
  u.searchParams.set('identity_provider', 'Google');
  u.searchParams.set('client_id', CLIENT_ID);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', 'email openid profile');
  u.searchParams.set('redirect_uri', REDIRECT);
  u.searchParams.set('state', state);
  u.searchParams.set('code_challenge_method', 'S256');
  u.searchParams.set('code_challenge', await sha256Base64Url(verifier));
  window.location.assign(u.toString());
}

async function tokenRequest(body) {
  const res = await fetch(`${DOMAIN}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
  if (!res.ok) throw new Error('token endpoint failed');
  return res.json();
}

// 起動時、?code= があればトークン交換する。処理したら true。
export async function handleRedirectCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (!code) return false;

  // state検証（自分が開始したフローでなければコードを使わない）
  const expectedState = sessionStorage.getItem(STATE_KEY);
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
  if (!expectedState || params.get('state') !== expectedState || !verifier) {
    window.history.replaceState({}, '', window.location.pathname);
    return false;
  }

  try {
    const tok = await tokenRequest({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      code,
      redirect_uri: REDIRECT,
      code_verifier: verifier,
    });
    store(tok);
  } finally {
    window.history.replaceState({}, '', window.location.pathname);
  }
  return true;
}

// 有効な ID トークンを返す（期限切れなら refresh）。なければ null。
export async function getOAuthIdToken() {
  let rec = read();
  if (!rec) return null;
  if (Date.now() < rec.exp) return rec.id;
  if (!rec.refresh) { clearOAuth(); return null; }
  try {
    const tok = await tokenRequest({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      refresh_token: rec.refresh,
    });
    rec = store(tok);
    return rec.id;
  } catch {
    clearOAuth();
    return null;
  }
}

export function logoutRedirect() {
  clearOAuth();
  const u = new URL(`${DOMAIN}/logout`);
  u.searchParams.set('client_id', CLIENT_ID);
  u.searchParams.set('logout_uri', REDIRECT);
  window.location.assign(u.toString());
}
