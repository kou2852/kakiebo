const API_URL = import.meta.env.VITE_API_URL || '';

let getToken = () => null;

/** 認証トークン取得関数を注入 (AuthContextから呼ばれる) */
export function setTokenProvider(fn) {
  getToken = fn;
}

async function request(path, options = {}) {
  const token = await getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (res.status === 204) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API Error: ${res.status}`);
  }
  return res.json();
}

// ── Journals ──
export const journals = {
  list: (start, end) => {
    const params = start && end ? `?start=${start}&end=${end}` : '';
    return request(`/api/journals${params}`);
  },
  create: (data) => request('/api/journals', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/api/journals/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/api/journals/${id}`, { method: 'DELETE' }),
};

// ── Accounts ──
export const accounts = {
  list: () => request('/api/accounts'),
  create: (data) => request('/api/accounts', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/api/accounts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/api/accounts/${id}`, { method: 'DELETE' }),
};

// ── Tags ──
export const tags = {
  list: () => request('/api/tags'),
  save: (data) => request('/api/tags', { method: 'POST', body: JSON.stringify(data) }),
};

// ── Feedback ──
export const feedback = {
  send: (body) => request('/api/feedback', { method: 'POST', body: JSON.stringify({ body }) }),
};

// ── Wallets ──
export const wallets = {
  list: () => request('/api/wallets'),
  save: (data) => request('/api/wallets', { method: 'POST', body: JSON.stringify(data) }),
};

// ── Budgets ──
export const budgets = {
  list: () => request('/api/budgets'),
  save: (data) => request('/api/budgets', { method: 'POST', body: JSON.stringify(data) }),
};

// ── Recurring（定期取引。全置換保存） ──
export const recurring = {
  save: (data) => request('/api/recurring', { method: 'POST', body: JSON.stringify(data) }),
};

// ── Presets（プリセット。全置換保存） ──
export const presets = {
  save: (data) => request('/api/presets', { method: 'POST', body: JSON.stringify(data) }),
};

// ── Rules（自動仕訳ルール。全置換保存） ──
export const rules = {
  save: (data) => request('/api/rules', { method: 'POST', body: JSON.stringify(data) }),
};

// ── E2E暗号化データ（方式A: データセット全体を1ブロブ。bundle=鍵バンドル, ct=暗号文） ──
export const encdata = {
  get: () => request('/api/encdata'),
  save: (data) => request('/api/encdata', { method: 'POST', body: JSON.stringify(data) }),
};

// ── Export / Import ──
export const data = {
  exportAll: () => request('/api/export'),
  importAll: (payload) => request('/api/import', { method: 'POST', body: JSON.stringify(payload) }),
};

// ── Account (自分のアカウント削除) ──
export const account = {
  remove: (reason) => request('/api/account', { method: 'DELETE', ...(reason ? { body: JSON.stringify({ reason }) } : {}) }),
};
