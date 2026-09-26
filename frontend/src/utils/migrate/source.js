// 他のアプリからの移行：CSV・JSON を「列名つきの行」にする。
// 表の形：{ columns: 列名の配列, rows: [{ line: 元の行番号（JSON は何件目か）, cells: 列ごとの文字列 }] }
import { parseCL } from '../csv.js';

const BOM = String.fromCharCode(0xfeff);

/** 全角括弧→半角（csv.js の toHalfParen と同じ扱い） */
const toHalfParen = (s) => (s || '').replace(/（/g, '(').replace(/）/g, ')');

/** 同じ名前の列が2つ以上あると引けないので、2つ目から「名前(2)」にする */
function uniqueNames(names) {
  const seen = {};
  return names.map((n) => {
    seen[n] = (seen[n] || 0) + 1;
    return seen[n] > 1 ? `${n}(${seen[n]})` : n;
  });
}

/**
 * CSV の本文 → 表。区切りは1行目にタブがあればタブ、無ければカンマ（引用符に対応）。
 * header=false なら1行目もデータとして読み、列名は「列1」「列2」…にする。
 */
export function csvTable(text, header = true) {
  if (text.startsWith(BOM)) text = text.slice(1);
  const lines = text.split(/\r?\n/).map((l, i) => ({ l, line: i + 1 })).filter(({ l }) => l.trim());
  const first = lines.length ? lines[0].l : '';
  const split = first.includes('\t') ? (l) => l.split('\t').map((c) => c.trim()) : parseCL;
  const all = lines.map(({ l, line }) => ({ line, cells: split(l) }));
  if (header) {
    return { columns: uniqueNames((all[0]?.cells || []).map((c) => toHalfParen(c).trim())), rows: all.slice(1) };
  }
  const n = all.reduce((m, r) => Math.max(m, r.cells.length), 0);
  return { columns: Array.from({ length: n }, (_, k) => `列${k + 1}`), rows: all };
}

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

/** 配列の場所（['data', '[]', 'attributes', 'transactions'] の形）→ 見せる名前 */
export const arrayLabel = (path) => (path.length ? path.join('.').replace(/\.\[\]/g, '[]') : '（全体）');

/** path の先にある配列の要素を、いちばん近い親の配列の要素（と何番目か）つきで集める */
function collect(root, path) {
  let cur = [{ value: root, parent: null }];
  for (const k of path) {
    const next = [];
    for (const { value, parent } of cur) {
      if (k === '[]') {
        if (Array.isArray(value)) value.forEach((v, index) => next.push({ value: v, parent: { value: v, index } }));
      } else if (isObj(value)) next.push({ value: value[k], parent });
    }
    cur = next;
  }
  return cur.flatMap(({ value, parent }) => (Array.isArray(value) ? value.filter(isObj).map((record) => ({ record, parent })) : []));
}

/** JSON の中の「オブジェクトの配列」を候補として一覧にする（配列の中の配列もたどる） */
export function jsonArrays(root) {
  const found = new Map();
  const walk = (v, path, depth) => {
    if (depth > 8) return;
    if (Array.isArray(v)) {
      if (v.length && v.every(isObj)) {
        found.set(arrayLabel(path), path);
        // 要素ごとに形が違うことがあるので、先頭の50件まで中をたどる
        v.slice(0, 50).forEach((o) => walk(o, [...path, '[]'], depth + 1));
      }
      return;
    }
    if (isObj(v)) for (const [k, x] of Object.entries(v)) walk(x, [...path, k], depth + 1);
  };
  walk(root, [], 0);
  return [...found.values()].map((path) => ({ path, label: arrayLabel(path), count: collect(root, path).length }));
}

/** オブジェクトを平らにする。入れ子のオブジェクトはドットでつなぎ、配列は列にしない */
function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix + k;
    if (Array.isArray(v)) continue;
    if (isObj(v)) flatten(v, key + '.', out);
    else out[key] = v == null ? '' : String(v);
  }
  return out;
}

/**
 * JSON の path の配列 → 表。配列の中の配列を選んだときは、親の項目を「親.〜」、
 * 親が何番目か（1から）を「親の番号」として足す（仕訳No に当てれば1仕訳ずつ束ねられる）。
 */
export function jsonTable(root, path) {
  const items = collect(root, path);
  const objs = items.map(({ record, parent }) => {
    const o = flatten(record);
    if (parent) {
      for (const [k, v] of Object.entries(flatten(parent.value))) o['親.' + k] = v;
      o['親の番号'] = String(parent.index + 1);
    }
    return o;
  });
  const columns = [];
  const seen = new Set();
  for (const o of objs) for (const k of Object.keys(o)) if (!seen.has(k)) { seen.add(k); columns.push(k); }
  return { columns, rows: objs.map((o, i) => ({ line: i + 1, cells: columns.map((c) => o[c] ?? '') })) };
}
