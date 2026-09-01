// 平文モード（E2E暗号化を有効にしていないアカウント）で使うエンドポイント群。
// frontend/src/api/client.js と同じ構造。暗号化モードでは /api/encdata だけを使うので不要。
import { request } from './client';

export const journals = {
  create: (d) => request('/api/journals', { method: 'POST', body: JSON.stringify(d) }),
  update: (id, d) => request(`/api/journals/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
  remove: (id) => request(`/api/journals/${id}`, { method: 'DELETE' }),
};

export const accounts = {
  create: (d) => request('/api/accounts', { method: 'POST', body: JSON.stringify(d) }),
  update: (id, d) => request(`/api/accounts/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
  remove: (id) => request(`/api/accounts/${id}`, { method: 'DELETE' }),
};

// { items } で送ると全置換になる（配列のままだと削除がサーバーに伝わらない）
const plain = (path) => ({
  list: () => request(path),
  save: (items) => request(path, { method: 'POST', body: JSON.stringify({ items }) }),
});

// list は { items, rev }、save は版番号 rev を添えて送る。食い違えば 409。
const versioned = (path) => ({
  list: () => request(path),
  save: (items, rev) => request(path, { method: 'POST', body: JSON.stringify({ items, rev }) }),
});

export const tags = plain('/api/tags');
export const wallets = plain('/api/wallets');
export const budgets = versioned('/api/budgets');
export const recurring = versioned('/api/recurring');
export const presets = versioned('/api/presets');
export const rules = versioned('/api/rules');
// タグ配分。id を持たず accountId + tagId で一意なので、他と同じ全置換扱い。
export const allocs = versioned('/api/allocs');
