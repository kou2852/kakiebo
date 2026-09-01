// frontend/src/api/client.js の移植。エンドポイントと 409 の扱いを Web 版と揃える。
import { ENVIRONMENTS } from '../config';

let getToken = () => null;
let envName = null;

export function configure(env, tokenProvider) {
  envName = env;
  getToken = tokenProvider;
}

export async function request(path, options = {}) {
  const token = await getToken();
  const res = await fetch(`${ENVIRONMENTS[envName].apiUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
  });

  if (res.status === 204) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const e = new Error(err.error || `API Error: ${res.status}`);
    // 409（他端末が先に更新）の判定と、サーバー側の最新状態を呼び出し元へ渡す
    e.status = res.status;
    e.payload = err;
    throw e;
  }
  return res.json();
}

// E2E暗号化データ（データセット全体を1ブロブ。bundle=鍵バンドル, ct=暗号文）
export const encdata = {
  get: () => request('/api/encdata'),
  save: (data) => request('/api/encdata', { method: 'POST', body: JSON.stringify(data) }),
};

// 問い合わせ（ログイン済みのスレッド。メールアドレスは扱わない）
export const inquiries = {
  list: () => request('/api/inquiries'),
  // id を渡すと既存スレッドへの返信、渡さなければ新規
  send: (data) => request('/api/inquiries', { method: 'POST', body: JSON.stringify(data) }),
};

// 暗号化していないユーザー向け（平文モード）
export const data = {
  exportAll: () => request('/api/export'),
  importAll: (payload) => request('/api/import', { method: 'POST', body: JSON.stringify(payload) }),
};
