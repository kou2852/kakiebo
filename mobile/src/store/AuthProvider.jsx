// 認証と接続先の管理。トークンは api/client に注入する。
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as cognito from '../auth/cognito';
import * as oauth from '../auth/oauth';
import * as api from '../api/client';
import { DEFAULT_ENV } from '../config';

const ENV_KEY = 'kk_env';
const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

// ID トークンの供給元。Google(OAuth) を優先し、無ければ SRP のセッションを使う。
const tokenFor = async (env) => (await oauth.getOAuthIdToken(env)) || (await cognito.currentIdToken(env));

export function AuthProvider({ children }) {
  const [env, setEnvState] = useState(DEFAULT_ENV);
  const [email, setEmail] = useState(null);
  const [via, setVia] = useState(null); // 'password' | 'google'
  const [booting, setBooting] = useState(true);

  // 保存済みセッションの復元。Google(OAuth) を先に見る。Web 版と同じ優先順。
  const restore = useCallback(async (e) => {
    if (await oauth.hasOAuthSession(e)) { setEmail('Google アカウント'); setVia('google'); return; }
    if (await cognito.currentIdToken(e)) { setEmail(cognito.currentEmail(e)); setVia('password'); return; }
    setEmail(null); setVia(null);
  }, []);

  // 起動時に一度だけ。以降の接続先変更は setEnv が面倒を見る。
  useEffect(() => {
    (async () => {
      // Cognito SDK は同期 Storage を要求するので、先に AsyncStorage から復元しておく。
      await cognito.hydrate();
      const saved = await AsyncStorage.getItem(ENV_KEY);
      const e = saved && saved !== env ? saved : env;
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
      await oauth.loginWithGoogle(env);
      setEmail('Google アカウント'); setVia('google');
    },
    redirectUri: oauth.redirectUri,
    signUp: (mail, password) => cognito.signUp(env, mail, password),
    confirmSignUp: (mail, code) => cognito.confirmSignUp(env, mail, code),
    signOut: async () => { cognito.signOut(env); await oauth.clearOAuth(env); setEmail(null); setVia(null); },
    setEnv,
  }), [env, email, via, booting, setEnv]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
