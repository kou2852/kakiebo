// Cognito 認証。Web 版（frontend/src/contexts/AuthContext.jsx）と同じユーザープールを使う。
// ユーザープールのクライアントは ALLOW_USER_SRP_AUTH しか許していないため、
// パスワードを直接送る InitiateAuth は使えない。SRP を実装している公式SDKに任せる。
// セッションの保存先は AsyncStorage（Web の localStorage 相当）。
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AuthenticationDetails, CognitoUser, CognitoUserAttribute, CognitoUserPool,
} from 'amazon-cognito-identity-js';
import { ENVIRONMENTS } from '../config';

// SDK は同期 API の Storage を要求するので、AsyncStorage の内容をメモリに載せて使う。
// 起動時に一度 hydrate してから認証を触ること。
const mem = new Map();
const KEYS = 'kk_cognito_keys';

const storage = {
  setItem(k, v) { mem.set(k, String(v)); persist(); return v; },
  getItem(k) { return mem.has(k) ? mem.get(k) : null; },
  removeItem(k) { mem.delete(k); persist(); },
  clear() { mem.clear(); persist(); },
};

let saving = null;
function persist() {
  // 連続書き込みをまとめる（SDK は1回のログインで十数キー書く）
  if (saving) return;
  saving = setTimeout(async () => {
    saving = null;
    await AsyncStorage.setItem(KEYS, JSON.stringify([...mem]));
  }, 0);
}

export async function hydrate() {
  const raw = await AsyncStorage.getItem(KEYS);
  if (raw) { try { new Map(JSON.parse(raw)).forEach((v, k) => mem.set(k, v)); } catch { /* 壊れていたら捨てる */ } }
}

const pools = {};
function pool(env) {
  if (!pools[env]) {
    const c = ENVIRONMENTS[env];
    pools[env] = new CognitoUserPool({ UserPoolId: c.userPoolId, ClientId: c.clientId, Storage: storage });
  }
  return pools[env];
}

const userFor = (env, email) => new CognitoUser({ Username: email, Pool: pool(env), Storage: storage });

export function signIn(env, email, password) {
  return new Promise((resolve, reject) => {
    userFor(env, email).authenticateUser(
      new AuthenticationDetails({ Username: email, Password: password }),
      {
        onSuccess: (session) => resolve(session.getIdToken().getJwtToken()),
        onFailure: reject,
        // 管理者作成ユーザーの初回パスワード変更。アプリからは扱わない。
        newPasswordRequired: () => reject(new Error('パスワードの再設定が必要です。Web版から行ってください')),
      }
    );
  });
}

export function signUp(env, email, password) {
  return new Promise((resolve, reject) => {
    pool(env).signUp(email, password, [new CognitoUserAttribute({ Name: 'email', Value: email })], null,
      (err) => (err ? reject(err) : resolve()));
  });
}

export function confirmSignUp(env, email, code) {
  return new Promise((resolve, reject) => {
    userFor(env, email).confirmRegistration(code, true, (err) => (err ? reject(err) : resolve()));
  });
}

// Cognito のエラーは英語で返る。日本語だけで配信するので、出す前に訳す。
// 「メールアドレスが存在しない」と「パスワードが違う」は同じ文言にする。
// 分けると、どのアドレスが登録済みかを外から総当たりで調べられてしまう。
const MESSAGES = {
  UsernameExistsException: 'このメールアドレスは登録済みです。ログインしてください。',
  NotAuthorizedException: 'メールアドレスまたはパスワードが違います。',
  UserNotFoundException: 'メールアドレスまたはパスワードが違います。',
  UserNotConfirmedException: 'メールアドレスの確認が済んでいません。',
  CodeMismatchException: '確認コードが違います。',
  ExpiredCodeException: '確認コードの有効期限が切れています。送り直してください。',
  InvalidPasswordException: 'パスワードが条件を満たしていません。8文字以上で、英小文字と数字を含めてください。',
  InvalidParameterException: '入力の形式が正しくありません。',
  LimitExceededException: '試行回数が多すぎます。しばらく時間をおいてください。',
  TooManyRequestsException: '試行回数が多すぎます。しばらく時間をおいてください。',
  NetworkError: '通信できませんでした。電波の良い場所で試してください。',
};

/** 表示用の文言。訳が無いものは原文のまま出す（隠すと原因が追えなくなる）。 */
export function authMessage(e) {
  return MESSAGES[e?.code || e?.name] || e?.message || String(e);
}

/** 確認コードの再送。メールが届かないと、そのアドレスは使えないまま詰む。 */
export function resendCode(env, email) {
  return new Promise((resolve, reject) => {
    userFor(env, email).resendConfirmationCode((err) => (err ? reject(err) : resolve()));
  });
}

/** 保存済みセッションから ID トークンを取り出す。無効なら null（期限切れは SDK が更新する）。 */
export function currentIdToken(env) {
  return new Promise((resolve) => {
    const cur = pool(env).getCurrentUser();
    if (!cur) return resolve(null);
    cur.getSession((err, session) => {
      resolve(err || !session?.isValid() ? null : session.getIdToken().getJwtToken());
    });
  });
}

export function currentEmail(env) {
  return pool(env).getCurrentUser()?.getUsername() || null;
}

export function signOut(env) {
  pool(env).getCurrentUser()?.signOut();
}
