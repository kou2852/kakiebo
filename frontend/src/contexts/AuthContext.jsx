import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { setTokenProvider, account as accountApi } from '../api/client';
import {
  OAUTH_ENABLED, loginWithGoogle, handleRedirectCallback,
  hasOAuthSession, getOAuthIdToken, logoutRedirect, clearOAuth,
} from '../auth/oauth';

const AuthContext = createContext(null);

const COGNITO_CONFIGURED =
  !!import.meta.env.VITE_COGNITO_USER_POOL_ID &&
  !!import.meta.env.VITE_COGNITO_CLIENT_ID;

// Cognito SDK は設定がある場合のみ動的にロード
let userPool = null;
let CognitoUser = null;
let AuthenticationDetails = null;

async function loadCognito() {
  if (userPool) return;
  const sdk = await import('amazon-cognito-identity-js');
  CognitoUser = sdk.CognitoUser;
  AuthenticationDetails = sdk.AuthenticationDetails;
  userPool = new sdk.CognitoUserPool({
    UserPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
    ClientId: import.meta.env.VITE_COGNITO_CLIENT_ID,
  });
}

const GUEST_KEY = 'kk_guest'; // ゲストモードのフラグ（データ本体は DataContext の kk4_guest）

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Cognito未設定時は開発モード（認証スキップ）
  const [devMode] = useState(!COGNITO_CONFIGURED);
  // ゲストモード（認証なし・localStorageのみ）。devMode とは別管理。
  const [guestMode, setGuestMode] = useState(false);
  // ゲスト→登録導線で AuthPage を新規登録モードで開くためのフラグ
  const [signupIntent, setSignupIntent] = useState(false);

  const getIdToken = useCallback(async () => {
    if (devMode || guestMode) return null;
    if (hasOAuthSession()) return getOAuthIdToken();
    if (!userPool) return null;
    return new Promise((resolve) => {
      const cur = userPool.getCurrentUser();
      if (!cur) return resolve(null);
      cur.getSession((err, session) => {
        if (err || !session?.isValid()) return resolve(null);
        resolve(session.getIdToken().getJwtToken());
      });
    });
  }, [devMode, guestMode]);

  useEffect(() => { setTokenProvider(getIdToken); }, [getIdToken]);

  // 起動時セッション復元
  useEffect(() => {
    if (devMode) {
      // 開発モード: 認証不要で即ログイン状態
      setUser({ devMode: true });
      setLoading(false);
      return;
    }
    // ゲストモード復元（実セッションが無いときのフォールバックに使う）
    const restoreGuest = () => {
      if (localStorage.getItem(GUEST_KEY)) {
        setGuestMode(true);
        setUser({ guest: true });
        return true;
      }
      return false;
    };

    // ?guest 付きで来たらゲストフラグを立てる（LP等からのワンクリック導線・AdSense確認用）。
    // 実セッションがあれば後続処理が優先しフラグは解除される。
    if (new URLSearchParams(window.location.search).get('guest') !== null) {
      localStorage.setItem(GUEST_KEY, '1');
      window.history.replaceState({}, '', window.location.pathname);
    }

    (async () => {
      // OAuth (Google): リダイレクト復帰の ?code= を処理 → 既存OAuthセッションを復元
      if (OAUTH_ENABLED) {
        const handled = await handleRedirectCallback().catch(() => false);
        if (handled || hasOAuthSession()) {
          const tok = await getOAuthIdToken();
          if (tok) {
            localStorage.removeItem(GUEST_KEY); // 実ログインしたらゲストフラグ解除
            setUser({ oauth: true }); setLoading(false); return;
          }
        }
      }
      // メール/パスワード (SRP) セッション復元
      loadCognito().then(() => {
        const cur = userPool.getCurrentUser();
        if (!cur) { restoreGuest(); setLoading(false); return; }
        cur.getSession((err, session) => {
          if (!err && session?.isValid()) { localStorage.removeItem(GUEST_KEY); setUser(cur); }
          else restoreGuest();
          setLoading(false);
        });
      }).catch(() => {
        // Cognito初期化失敗 → ゲスト復元 or 開発モードにフォールバック
        if (!restoreGuest()) setUser({ devMode: true });
        setLoading(false);
      });
    })();
  }, [devMode]);

  const signUp = useCallback(async (email, password) => {
    await loadCognito();
    return new Promise((resolve, reject) => {
      userPool.signUp(email, password, [], null, (err, result) => {
        if (err) { setError(err.message); return reject(err); }
        resolve(result);
      });
    });
  }, []);

  const confirmSignUp = useCallback(async (email, code) => {
    await loadCognito();
    const cognitoUser = new CognitoUser({ Username: email, Pool: userPool });
    return new Promise((resolve, reject) => {
      cognitoUser.confirmRegistration(code, true, (err, result) => {
        if (err) { setError(err.message); return reject(err); }
        resolve(result);
      });
    });
  }, []);

  // 確認コードの再送（メールが届かない/期限切れ時）
  const resendCode = useCallback(async (email) => {
    await loadCognito();
    const cognitoUser = new CognitoUser({ Username: email, Pool: userPool });
    return new Promise((resolve, reject) => {
      cognitoUser.resendConfirmationCode((err, result) => {
        if (err) { setError(err.message); return reject(err); }
        resolve(result);
      });
    });
  }, []);

  // パスワード再設定: 確認コードをメール送信
  const forgotPassword = useCallback(async (email) => {
    await loadCognito();
    const cognitoUser = new CognitoUser({ Username: email, Pool: userPool });
    return new Promise((resolve, reject) => {
      cognitoUser.forgotPassword({
        onSuccess: resolve,
        onFailure: (err) => { setError(err.message); reject(err); },
      });
    });
  }, []);

  // パスワード再設定: コード + 新パスワードで確定
  const confirmForgotPassword = useCallback(async (email, code, newPassword) => {
    await loadCognito();
    const cognitoUser = new CognitoUser({ Username: email, Pool: userPool });
    return new Promise((resolve, reject) => {
      cognitoUser.confirmPassword(code, newPassword, {
        onSuccess: resolve,
        onFailure: (err) => { setError(err.message); reject(err); },
      });
    });
  }, []);

  const signIn = useCallback(async (email, password) => {
    await loadCognito();
    const cognitoUser = new CognitoUser({ Username: email, Pool: userPool });
    const authDetails = new AuthenticationDetails({ Username: email, Password: password });
    return new Promise((resolve, reject) => {
      cognitoUser.authenticateUser(authDetails, {
        onSuccess: (session) => {
          localStorage.removeItem(GUEST_KEY); setGuestMode(false);
          setUser(cognitoUser); setError(null); resolve(session);
        },
        onFailure: (err) => { setError(err.message); reject(err); },
      });
    });
  }, []);

  const signOut = useCallback(() => {
    if (guestMode) {
      localStorage.removeItem(GUEST_KEY);
      setGuestMode(false);
      setUser(null);
      return;
    }
    if (devMode) return;
    if (hasOAuthSession()) { logoutRedirect(); return; }
    const cur = userPool?.getCurrentUser();
    if (cur) cur.signOut();
    setUser(null);
  }, [devMode, guestMode]);

  // アカウント削除: サーバーで全データ+Cognitoユーザーを削除し、ローカルセッションも破棄
  const deleteAccount = useCallback(async () => {
    await accountApi.remove();
    clearOAuth();
    const cur = userPool?.getCurrentUser();
    if (cur) cur.signOut();
    localStorage.removeItem(GUEST_KEY);
    setGuestMode(false);
    setUser(null);
  }, []);

  // ゲストとして利用開始
  const loginAsGuest = useCallback(() => {
    localStorage.setItem(GUEST_KEY, '1');
    setGuestMode(true);
    setUser({ guest: true });
    setError(null);
  }, []);

  // ゲストをやめて登録画面へ（データ kk4_guest は登録後の移行用に残す）
  const exitGuest = useCallback(() => {
    localStorage.removeItem(GUEST_KEY);
    setGuestMode(false);
    setSignupIntent(true);
    setUser(null);
  }, []);

  const tier = guestMode ? 'guest' : (user ? 'free' : null);

  const value = {
    user, loading, error, devMode, guestMode, tier, signupIntent,
    isAuthenticated: !!user,
    oauthEnabled: OAUTH_ENABLED,
    signUp, confirmSignUp, resendCode, signIn, signOut, loginWithGoogle,
    forgotPassword, confirmForgotPassword, deleteAccount,
    loginAsGuest, exitGuest,
    clearError: () => setError(null),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
