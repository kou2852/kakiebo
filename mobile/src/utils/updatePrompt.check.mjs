// node src/utils/updatePrompt.check.mjs
import assert from 'node:assert/strict';
import { olderVersion, shouldPromptUpdate, SNOOZE_DAYS } from './updatePrompt.js';

const DAY = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 9, 20);
const latest = { version: '1.0.4', url: 'https://apps.apple.com/jp/app/id6806592989' };

assert.equal(olderVersion('1.0.2', '1.0.10'), true);
assert.equal(olderVersion('1.0.10', '1.0.2'), false);
assert.equal(olderVersion('1.0.3', '1.0.3'), false);
assert.equal(olderVersion('1.0', '1.0.1'), true);

// 新しい版があれば出す
assert.equal(shouldPromptUpdate({ current: '1.0.3', latest, snooze: null, now }), true);
// 同じ版・より新しい版を使っているなら出さない
assert.equal(shouldPromptUpdate({ current: '1.0.4', latest, snooze: null, now }), false);
assert.equal(shouldPromptUpdate({ current: '1.0.5', latest, snooze: null, now }), false);
// 最新版の情報が無い・URL が https でないなら出さない
assert.equal(shouldPromptUpdate({ current: '1.0.3', latest: null, snooze: null, now }), false);
assert.equal(shouldPromptUpdate({ current: '1.0.3', latest: { version: '1.0.4' }, snooze: null, now }), false);
assert.equal(shouldPromptUpdate({ current: '1.0.3', latest: { ...latest, url: 'http://example.com' }, snooze: null, now }), false);
// 「あとで」を押した版は SNOOZE_DAYS のあいだ出さない
assert.equal(shouldPromptUpdate({ current: '1.0.3', latest, snooze: { version: '1.0.4', at: now - DAY }, now }), false);
assert.equal(shouldPromptUpdate({ current: '1.0.3', latest, snooze: { version: '1.0.4', at: now - (SNOOZE_DAYS - 0.01) * DAY }, now }), false);
assert.equal(shouldPromptUpdate({ current: '1.0.3', latest, snooze: { version: '1.0.4', at: now - SNOOZE_DAYS * DAY }, now }), true);
// もっと新しい版が出たら、待たずに出す
assert.equal(shouldPromptUpdate({ current: '1.0.3', latest: { ...latest, version: '1.0.5' }, snooze: { version: '1.0.4', at: now - DAY }, now }), true);

console.log('updatePrompt: ok');
