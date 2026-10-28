// 画面と API のあいだの薄い層。
// ・手元のダッシュボード（server.mjs）: 何もしない。今までどおり同じ場所の /api/... を呼ぶ。
// ・管理アプリ（Windows・iOS）: アプリが window.KK_ADMIN を入れておく。Lambda の宛先に、Cognito の ID トークンを付けて呼ぶ。
//   KK_ADMIN = { apiBase, clientId, region, cognitoUrl?(試験用), storage?: { get(k), set(k, v), del(k) }（Promise を返す） }
// ログインは Cognito の USER_PASSWORD_AUTH ＋ TOTP（認証アプリの6桁）。パスワードは保存せず、更新トークンだけを保存する。
(function(){
  const cfg = window.KK_ADMIN;
  if(!cfg){ window.KK = { remote: false, fetch: (p, o) => fetch(p, o) }; return; }

  const RT_KEY = 'kk_admin_rt';
  const idpUrl = cfg.cognitoUrl || ('https://cognito-idp.' + (cfg.region || 'ap-northeast-1') + '.amazonaws.com/');
  const store = cfg.storage || {
    get: async (k) => { try{ return localStorage.getItem(k); }catch(e){ return null; } },
    set: async (k, v) => { try{ localStorage.setItem(k, v); }catch(e){ /* 持てなくても毎回ログインすれば使える */ } },
    del: async (k) => { try{ localStorage.removeItem(k); }catch(e){ /* 同上 */ } },
  };
  let idToken = null, idExp = 0;

  async function idp(target, body){
    const r = await fetch(idpUrl, { method: 'POST',
      headers: { 'content-type': 'application/x-amz-json-1.1', 'x-amz-target': 'AWSCognitoIdentityProviderService.' + target },
      body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if(!r.ok) throw new Error(j.message || j.__type || ('ログインに失敗しました（' + r.status + '）'));
    return j;
  }
  const expOf = (t) => { try{ return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp * 1000; }catch(e){ return 0; } };
  async function keep(res){
    idToken = res.IdToken; idExp = expOf(idToken);
    if(res.RefreshToken) await store.set(RT_KEY, res.RefreshToken);
  }

  // ── ログイン画面（DOM を組み立てる。innerHTML は使わない） ──
  function el(tag, attrs, kids){
    const e = document.createElement(tag);
    for(const k in (attrs || {})) e.setAttribute(k, attrs[k]);
    for(const c of (kids || [])) e.append(c);
    return e;
  }
  let box = null;
  /** 入力欄を出し、送られた値を返す。note は説明、secret は認証アプリに入れる鍵（選択してコピーできるように出す） */
  function ask(title, fields, { note, secret, error } = {}){
    return new Promise((resolve) => {
      if(box) box.remove();
      const inputs = fields.map((f) => el('input', { name: f.name, type: f.type || 'text', autocomplete: f.ac || 'off',
        inputmode: f.inputmode || '', required: '' }));
      const form = el('form', { class: 'login-card' }, [
        el('h2', {}, [title]),
        ...(note ? [el('p', { class: 'hint' }, [note])] : []),
        ...(secret ? [el('code', { class: 'login-secret' }, [secret])] : []),
        ...fields.map((f, i) => el('label', {}, [f.label, inputs[i]])),
        el('p', { class: 'login-err' }, [error || '']),
        el('button', { class: 'primary', type: 'submit' }, ['次へ']),
      ]);
      form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const v = {}; inputs.forEach((x, i) => { v[fields[i].name] = x.value.trim(); });
        form.querySelector('button').disabled = true;
        resolve(v);
      });
      box = el('div', { class: 'login' }, [form]);
      document.body.append(box);
      inputs[0].focus();
    });
  }
  const close = () => { if(box){ box.remove(); box = null; } };

  const CODE = { name: 'code', label: '認証アプリの6桁', inputmode: 'numeric', ac: 'one-time-code' };

  async function signIn(error){
    const v = await ask('管理画面にログイン', [
      { name: 'email', label: 'メールアドレス', type: 'email', ac: 'username' },
      { name: 'password', label: 'パスワード', type: 'password', ac: 'current-password' },
    ], { error });
    let res = await idp('InitiateAuth', { AuthFlow: 'USER_PASSWORD_AUTH', ClientId: cfg.clientId,
      AuthParameters: { USERNAME: v.email, PASSWORD: v.password } });
    // 初回は 仮パスワードの変更 → 認証アプリの登録 の順に求められる
    for(let i = 0; res.ChallengeName && i < 5; i++){
      const user = (res.ChallengeParameters && res.ChallengeParameters.USER_ID_FOR_SRP) || v.email;
      const answer = (extra, session) => idp('RespondToAuthChallenge', { ChallengeName: res.ChallengeName, ClientId: cfg.clientId,
        Session: session || res.Session, ChallengeResponses: Object.assign({ USERNAME: user }, extra) });
      if(res.ChallengeName === 'NEW_PASSWORD_REQUIRED'){
        const p = await ask('新しいパスワード', [{ name: 'pw', label: '12文字以上（英大文字・小文字・数字を含む）', type: 'password', ac: 'new-password' }],
          { note: '仮パスワードでログインしました。新しいパスワードを決めてください。' });
        res = await answer({ NEW_PASSWORD: p.pw });
      }else if(res.ChallengeName === 'MFA_SETUP'){
        const a = await idp('AssociateSoftwareToken', { Session: res.Session });
        const c = await ask('認証アプリの登録', [CODE], { secret: a.SecretCode,
          note: '認証アプリ（Google Authenticator など）で「セットアップキーを入力」を選び、下の文字列を入れてください。表示された6桁を入力します。' });
        const vr = await idp('VerifySoftwareToken', { Session: a.Session, UserCode: c.code, FriendlyDeviceName: 'admin' });
        res = await answer({}, vr.Session);
      }else if(res.ChallengeName === 'SOFTWARE_TOKEN_MFA'){
        const c = await ask('確認コード', [CODE]);
        res = await answer({ SOFTWARE_TOKEN_MFA_CODE: c.code });
      }else{
        throw new Error('対応していない確認です: ' + res.ChallengeName);
      }
    }
    if(!res.AuthenticationResult) throw new Error('ログインを完了できませんでした');
    await keep(res.AuthenticationResult);
    close();
  }

  // 有効な ID トークンを用意する。更新トークンで取り直せなければログイン画面を出す（成功するまで繰り返す）
  let pending = null;
  function ensure(forceRefresh){
    if(!forceRefresh && idToken && idExp - Date.now() > 60000) return Promise.resolve();
    if(pending) return pending;
    pending = (async () => {
      const rt = await store.get(RT_KEY);
      if(rt){
        try{
          const r = await idp('InitiateAuth', { AuthFlow: 'REFRESH_TOKEN_AUTH', ClientId: cfg.clientId, AuthParameters: { REFRESH_TOKEN: rt } });
          return keep(r.AuthenticationResult);
        }catch(e){ await store.del(RT_KEY); }
      }
      let err = '';
      for(;;){
        try{ return await signIn(err); }catch(e){ err = e.message; }
      }
    })().finally(() => { pending = null; });
    return pending;
  }

  // 同時に流す呼び出しは2本まで（冷えた Lambda をむやみに増やさない）
  const LIMIT = 2; let running = 0; const waiting = [];
  const slot = () => running < LIMIT ? (running++, Promise.resolve()) : new Promise((r) => waiting.push(r));
  const free = () => { const n = waiting.shift(); if(n) n(); else running--; };

  async function remoteFetch(path, opts){
    await slot();
    try{
      for(let attempt = 0; ; attempt++){
        await ensure(attempt > 0);
        const o = Object.assign({}, opts || {});
        o.headers = Object.assign({}, o.headers || {}, { authorization: 'Bearer ' + idToken });
        const r = await fetch(cfg.apiBase.replace(/\/$/, '') + path, o);
        if(r.status !== 401 || attempt > 0) return r;
        idToken = null; // 期限切れ・取り消し。1回だけ取り直して再送する
      }
    }finally{ free(); }
  }

  async function signOut(){
    const rt = await store.get(RT_KEY);
    if(rt) await idp('RevokeToken', { Token: rt, ClientId: cfg.clientId }).catch(() => {});
    await store.del(RT_KEY);
    location.reload();
  }

  window.KK = { remote: true, fetch: remoteFetch, signOut };
  document.addEventListener('DOMContentLoaded', () => {
    const r = document.getElementById('refresh');
    if(!r) return;
    const b = el('button', { id: 'signout', type: 'button' }, ['ログアウト']);
    b.addEventListener('click', signOut);
    r.after(b);
  });
})();
