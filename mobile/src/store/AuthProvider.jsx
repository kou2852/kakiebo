// 認証と接続先の管理。トークンは api/client に注入する。
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as cognito from '../auth/cognito';
import * as oauth from '../auth/oauth';
import * as api from '../api/client';
import { DEFAULT_ENV, ENVIRONMENTS } from '../config';

const ENV_KEY = 'kk_env';

// 外部IdPで入ったときの表示名。Apple は Hide My Email だと中継アドレスが来るので、
// メールをそのまま出さずプロバイダ名で示す。
const IDP_LABEL = { google: 'Google アカウント', apple: 'Apple アカウント' };
const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

// ID トークンの供給元。外部IdP(OAuth) を優先し、無ければ SRP のセッションを使う。
const tokenFor = async (env) => (await oauth.getOAuthIdToken(env)) || (await cognito.currentIdToken(env));

export function AuthProvider({ children }) {
  const [env, setEnvState] = useState(DEFAULT_ENV);
  const [email, setEmail] = useState(null);
  const [via, setVia] = useState(null); // 'password' | 'google' | 'apple'
  const [booting, setBooting] = useState(true);

  // 保存済みセッションの復元。外部IdP(OAuth) を先に見る。Web 版と同じ優先順。
  const restore = useCallback(async (e) => {
    const idp = await oauth.oauthProvider(e);
    if (idp) { setEmail(IDP_LABEL[idp] || 'アカウント'); setVia(idp); return; }
    if (await cognito.currentIdToken(e)) { setEmail(cognito.currentEmail(e)); setVia('password'); return; }
    setEmail(null); setVia(null);
  }, []);

  // 起動時に一度だけ。以降の接続先変更は setEnv が面倒を見る。
  useEffect(() => {
    (async () => {
      // Cognito SDK は同期 Storage を要求するので、先に AsyncStorage から復元しておく。
      await cognito.hydrate();
      // 開発環境を配布物から外したので、保存済みの値が今も存在する接続先のときだけ使う。
      // 古い端末に 'dev' が残っていても、そのまま本番へ寄せる。
      const saved = await AsyncStorage.getItem(ENV_KEY);
      const e = saved && ENVIRONMENTS[saved] ? saved : env;
      setEnvState(e);
      api.configure(e, () => tokenFor(e));
      await restore(e);
      setBooting(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 起動時の一度きり。env は初期値を読むだけ。
  }, []);

  const setEnv = useCallback(async (next) => {
    setEnvState(next);
    setEmail(null); // 環境をまたいでセッションは共有しない
    api.configure(next, () => tokenFor(next));
    await AsyncStorage.setItem(ENV_KEY, next);
    await restore(next);
  }, [restore]);

  const value = useMemo(() => ({
    env, email, via, booting,
    signedIn: !!email,
    signIn: async (mail, password) => {
      await cognito.signIn(env, mail, password);
      setEmail(mail); setVia('password');
    },
    signInWithGoogle: async () => {
      await oauth.loginWithIdp(env, 'google');
      setEmail(IDP_LABEL.google); setVia('google');
    },
    // Guideline 4.8。Hide My Email を選ばれると中継アドレスが来るので、
    // メール本文で本人に届ける前提の機能をここに足さないこと。
    signInWithApple: async () => {
      await oauth.loginWithIdp(env, 'apple');
      setEmail(IDP_LABEL.apple); setVia('apple');
    },
    redirectUri: oauth.redirectUri,
    signUp: (mail, password) => cognito.signUp(env, mail, password),
    confirmSignUp: (mail, code) => cognito.confirmSignUp(env, mail, code),
    resendCode: (mail) => cognito.resendCode(env, mail),
    signOut: async () => { cognito.signOut(env); await oauth.clearOAuth(env); setEmail(null); setVia(null); },
    // アカウントの削除。サーバーの帳簿と Cognito ユーザーを消してから、この端末の
    // セッションを落とす。端末に残る帳簿の削除は呼び出し側が行う（消す順序を誤ると、
    // サーバーだけ消えて端末に残り、次の同期で復活する）。
    deleteAccount: async (reason) => {
      await api.account.remove(reason);
      cognito.signOut(env);
      await oauth.clearOAuth(env);
      setEmail(null); setVia(null);
    },
    setEnv,
  }), [env, email, via, booting, setEnv]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
