// node src/utils/homeLayout.check.mjs
import assert from 'node:assert/strict';
import { DEFAULT_LAYOUT, HOME_ITEMS, moveItem, normalizeLayout, toggleItem } from './homeLayout.js';

const ids = (l) => l.map((x) => x.id);

// 保存が無い・壊れている → 初期の並び（すべて出す）
assert.deepEqual(normalizeLayout(null), DEFAULT_LAYOUT);
assert.deepEqual(normalizeLayout('x'), DEFAULT_LAYOUT);
assert.ok(normalizeLayout(null).every((x) => x.on));

// 知らない項目は捨て、重複は1つに、足りない項目は末尾に「出す」で足す
const n = normalizeLayout([{ id: 'flow', on: false }, { id: 'old-card', on: true }, { id: 'flow', on: true }, { id: 'networth', on: false }]);
assert.deepEqual(ids(n).slice(0, 2), ['flow', 'networth']);
assert.equal(n.length, HOME_ITEMS.length);
assert.equal(n.find((x) => x.id === 'flow').on, false);
assert.equal(n.find((x) => x.id === 'networth').on, false);
assert.equal(n.find((x) => x.id === 'budget').on, true);

// 期間の切り替えは消せない（保存が「出さない」でも出す・切り替えても変わらない）
assert.equal(normalizeLayout([{ id: 'period', on: false }]).find((x) => x.id === 'period').on, true);
assert.deepEqual(toggleItem(DEFAULT_LAYOUT, 'period'), DEFAULT_LAYOUT);
assert.equal(toggleItem(DEFAULT_LAYOUT, 'flow').find((x) => x.id === 'flow').on, false);

// 並べ替え。端では変えない
assert.deepEqual(ids(moveItem(DEFAULT_LAYOUT, 1, -1)).slice(0, 2), ['pending', 'networth']);
assert.equal(moveItem(DEFAULT_LAYOUT, 0, -1), DEFAULT_LAYOUT);
assert.equal(moveItem(DEFAULT_LAYOUT, DEFAULT_LAYOUT.length - 1, 1), DEFAULT_LAYOUT);

console.log('homeLayout: ok');
