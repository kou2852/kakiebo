import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';

// Cognito の英語エラーを日本語化（前方一致）
const ERROR_JA = [
  ['Incorrect username or password', 'メールアドレスまたはパスワードが正しくありません'],
  ['User already exists', 'このメールアドレスは既に登録されています'],
  ['An account with the given email already exists', 'このメールアドレスは既に登録されています'],
  ['Invalid verification code', '確認コードが正しくありません'],
  ['User is not confirmed', 'メールアドレスの確認が完了していません。確認コードを入力してください'],
  ['Attempt limit exceeded', '試行回数の上限に達しました。しばらくしてからお試しください'],
  ['Password attempts exceeded', '試行回数の上限に達しました。しばらくしてからお試しください'],
  ['Password did not conform with policy', 'パスワードは8文字以上で、英小文字と数字を含めてください'],
  ['Password does not conform to policy', 'パスワードは8文字以上で、英小文字と数字を含めてください'],
  ['Invalid code provided', '確認コードが無効です。再度コードを送信してください'],
  ['Network error', '通信エラーが発生しました。接続を確認してください'],
];

function jpError(msg) {
  if (!msg) return msg;
  const hit = ERROR_JA.find(([en]) => msg.startsWith(en));
  return hit ? hit[1] : msg;
}

// メール新規登録の停止フラグ。Cognito標準送信に切替済み（SES本番アクセス不要で誰にでも送れる）のため再開。
const EMAIL_SIGNUP_DISABLED = false;

export default function AuthPage() {
  const { signIn, signUp, confirmSignUp, resendCode, error, clearError, oauthEnabled, loginWithGoogle, loginAsGuest, signupIntent,
    forgotPassword, confirmForgotPassword } = useAuth();
  const [mode, setMode] = useState(signupIntent ? 'signup' : 'login'); // 'login' | 'signup' | 'confirm' | 'forgot' | 'reset'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const go = (m) => { setMode(m); clearError(); setNotice(''); };

  const signupBlocked = EMAIL_SIGNUP_DISABLED && mode === 'signup';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (EMAIL_SIGNUP_DISABLED && mode === 'signup') return;
    clearError();
    setNotice('');
    setBusy(true);
    try {
      if (mode === 'login') {
        await signIn(email, password);
      } else if (mode === 'signup') {
        await signUp(email, password);
        setMode('confirm');
      } else if (mode === 'confirm') {
        await confirmSignUp(email, code);
        await signIn(email, password);
      } else if (mode === 'forgot') {
        await forgotPassword(email);
        setMode('reset');
        setNotice('確認コードをメールに送信しました');
      } else if (mode === 'reset') {
        await confirmForgotPassword(email, code, password);
        setMode('login');
        setCode(''); setPassword('');
        setNotice('パスワードを再設定しました。ログインしてください');
      }
    } catch {
      // error は AuthContext が管理
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async (e) => {
    e.preventDefault();
    if (!email) { setNotice('メールアドレスを入力してください'); return; }
    clearError(); setNotice('');
    try { await resendCode(email); setNotice('確認コードを再送しました'); }
    catch { /* error は AuthContext が管理 */ }
  };

  const showEmail = mode !== 'confirm';
  const showCode = mode === 'confirm' || mode === 'reset';
  const showPassword = mode === 'login' || mode === 'signup' || mode === 'reset';
  const submitLabel = mode === 'login' ? 'ログイン' : mode === 'signup' ? 'アカウント作成'
    : mode === 'confirm' ? '確認' : mode === 'forgot' ? '確認コードを送信' : 'パスワードを再設定';

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg0)', padding: 20,
    }}>
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 16,
        padding: 32, width: '100%', maxWidth: 380, boxShadow: 'var(--csh)',
      }}>
        <h1 style={{
          fontFamily: 'inherit', fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em',
          color: 'var(--ac)', textAlign: 'center', marginBottom: 4,
        }}>
          kurofukubo
        </h1>
        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--tx3)', marginBottom: 24 }}>
          純資産まで見える複式簿記の家計簿
        </p>

        {signupBlocked && (
          <div style={{ background: 'var(--bg3)', border: '1px solid var(--bd)', borderRadius: 7, padding: '14px 16px', fontSize: 13, color: 'var(--tx2)', lineHeight: 1.8, textAlign: 'center' }}>
            ⚠️ メールアドレスでの新規登録は現在一時停止しています。<br />
            <span style={{ fontSize: 12, color: 'var(--tx3)' }}>下のGoogleアカウントで登録・ログインしてください。</span>
          </div>
        )}
        {!signupBlocked && (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {showEmail && (
            <div className="fg">
              <label className="fl">メールアドレス</label>
              <input className="fc" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
          )}
          {showCode && (
            <div className="fg">
              <label className="fl">確認コード（メール送信済み）</label>
              <input className="fc" type="text" value={code} onChange={(e) => setCode(e.target.value)}
                required placeholder="6桁のコード" />
            </div>
          )}
          {mode === 'confirm' && (
            <p style={{ fontSize: 11, color: 'var(--tx3)', lineHeight: 1.7, margin: '-2px 0 0' }}>
              確認コードのメールを送信しました。数分たっても届かない場合は<strong>迷惑メール（スパム）フォルダ</strong>もご確認ください（差出人: no-reply@verificationemail.com）。
              <a href="#" onClick={handleResend} style={{ color: 'var(--ac)', marginLeft: 4 }}>コードを再送</a>
            </p>
          )}
          {showPassword && (
            <div className="fg">
              <label className="fl">{mode === 'reset' ? '新しいパスワード' : 'パスワード'}</label>
              <input className="fc" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                required minLength={8} placeholder="8文字以上" />
            </div>
          )}

          {notice && (
            <p style={{ color: 'var(--grn)', fontSize: 12, textAlign: 'center' }}>{notice}</p>
          )}
          {error && (
            <p style={{ color: 'var(--red)', fontSize: 12, textAlign: 'center' }}>{jpError(error)}</p>
          )}

          <button className="btn btn-p" type="submit" disabled={busy}
            style={{ width: '100%', justifyContent: 'center', padding: '10px 0', fontSize: 14 }}>
            {busy ? '処理中...' : submitLabel}
          </button>
        </form>
        )}

        {(mode === 'login' || mode === 'signup') && (
          <>
            {mode === 'signup' && (
              <p style={{ fontSize: 11.5, color: 'var(--tx2)', textAlign: 'center', margin: '14px 0 0', lineHeight: 1.6 }}>
                💡 <strong>Googleで登録</strong>すると、確認メール不要で今すぐ使えます（最速・確実）。
              </p>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0', color: 'var(--tx3)', fontSize: 11 }}>
              <span style={{ flex: 1, height: 1, background: 'var(--bd)' }} />または<span style={{ flex: 1, height: 1, background: 'var(--bd)' }} />
            </div>
            {oauthEnabled && (
              <button type="button" className="btn btn-g" onClick={loginWithGoogle}
                style={{ width: '100%', justifyContent: 'center', padding: '10px 0', fontSize: 14, gap: 8, marginBottom: 10 }}>
                <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
                  <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.4 30.4 0 24 0 14.6 0 6.4 5.4 2.5 13.3l7.9 6.1C12.3 13.2 17.7 9.5 24 9.5z"/>
                  <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.5 3-2.2 5.5-4.7 7.2l7.3 5.7C43.8 38 46.5 31.8 46.5 24.5z"/>
                  <path fill="#FBBC05" d="M10.4 28.6c-.5-1.5-.8-3-.8-4.6s.3-3.1.8-4.6l-7.9-6.1C.9 16.5 0 20.1 0 24s.9 7.5 2.5 10.7l7.9-6.1z"/>
                  <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.3-5.7c-2 1.4-4.7 2.3-8.6 2.3-6.3 0-11.7-3.7-13.6-9.9l-7.9 6.1C6.4 42.6 14.6 48 24 48z"/>
                </svg>
                Googleでログイン
              </button>
            )}
            <button type="button" className="btn btn-g" onClick={loginAsGuest}
              style={{ width: '100%', justifyContent: 'center', padding: '10px 0', fontSize: 14, gap: 8 }}>
              👤 ゲストとして試す
            </button>
            <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--tx3)', marginTop: 6 }}>
              ※ データはこの端末にのみ保存されます
            </p>
          </>
        )}

        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 12 }}>
          {mode === 'login' ? (
            <>
              {EMAIL_SIGNUP_DISABLED ? (
                <span style={{ color: 'var(--tx3)' }}>
                  メールアドレスでの新規登録は一時停止中です。Googleアカウントでご登録ください。
                </span>
              ) : (
                <span style={{ color: 'var(--tx3)' }}>
                  アカウントをお持ちでない方は
                  <a href="#" onClick={(e) => { e.preventDefault(); go('signup'); }}
                    style={{ color: 'var(--ac)', marginLeft: 4 }}>新規登録</a>
                </span>
              )}
              <div style={{ marginTop: 8 }}>
                <a href="#" onClick={(e) => { e.preventDefault(); go('forgot'); }}
                  style={{ color: 'var(--tx3)' }}>パスワードをお忘れですか？</a>
              </div>
            </>
          ) : mode === 'signup' ? (
            <span style={{ color: 'var(--tx3)' }}>
              既にアカウントをお持ちの方は
              <a href="#" onClick={(e) => { e.preventDefault(); go('login'); }}
                style={{ color: 'var(--ac)', marginLeft: 4 }}>ログイン</a>
            </span>
          ) : (
            <a href="#" onClick={(e) => { e.preventDefault(); go('login'); }}
              style={{ color: 'var(--ac)' }}>ログインに戻る</a>
          )}
        </div>
      </div>
    </div>
  );
}
