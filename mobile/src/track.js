// 自前の計測ビーコン（2026-10-16 決定）。ウェブ版 frontend/src/utils/track.js と同じ仕組み。
//
// https://app.kurofukubo.com/_e/<出来事> を GET するだけ。受け取る側は何も持たず、CloudFront の
// アクセスログに残った行を管理ダッシュボードの集計（scripts/admin/report/src/metrics.mjs）が数える。
// 送るのは出来事の名前だけ。金額・科目名・摘要・端末の識別子は送らない。
//
// ・オンラインのときだけ数える。送れなかった分は捨てる（貯めて送り直さない。2026-10-16 決定）
// ・同じ出来事は1台につき一度だけ（回数ではなく「何人がそこまで来たか」を数えるため）。
//   印は送る前に付ける。送れなくても送り直さない（＝捨てる）
// ・名前の頭は m_。ウェブ版の app_first・first_journal などと混ざらないようにする
// ・名乗り（User-Agent）を自前の名前にする。Android の既定（okhttp）は集計側でボット扱いになり、捨てられる
// ・開発中（__DEV__）は送らずログに出すだけ。自分の操作で数字を汚さない
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { appVersion } from './updates';

const BASE = 'https://app.kurofukubo.com/_e/';
const UA = `kurofukubo-app/${appVersion} (${Platform.OS})`;
const SENT_KEY = (event) => `track.sent.${event}`;

// 同じ出来事を続けて呼ばれたとき、保存が終わる前に二度送らないための印
const inFlight = new Set();

/** この端末で一度だけ送る。送れなかったら捨てる。 */
export async function trackOnce(event) {
  if (inFlight.has(event)) return;
  inFlight.add(event);
  try {
    if (await AsyncStorage.getItem(SENT_KEY(event))) return;
    await AsyncStorage.setItem(SENT_KEY(event), '1');
    if (__DEV__) { console.log('[計測]', event); return; }
    fetch(BASE + event, { method: 'GET', headers: { 'User-Agent': UA } }).catch(() => {});
  } catch {
    // 保存できない端末では何もしない。計測のために機能を止めない
  } finally {
    inFlight.delete(event);
  }
}

// ── 新しく入れた端末だけを数える ──────────────────────────
//
// アップデートで来た今の利用者まで数えると、入れた直後に「口座の残高」「最初の記帳」などが一斉に届き、
// 新しく入れた人がどこまで進むかが分からなくなる。新しいかどうかは、この計測が初めて動いたときに
// オンボーディングを出すかどうかで決め、端末に残す（store/TrackSync.jsx）。

const COHORT_KEY = 'track.cohort'; // 'new' | 'existing'
const FIRST_KEY = 'track.first';   // 使い始めた日 YYYY-MM-DD（新しく入れた端末だけ）

/** 新しく入れた端末かを決める（決まっていればそれを返す）。 */
export async function decideCohort(isNew, todayStr) {
  try {
    const saved = await AsyncStorage.getItem(COHORT_KEY);
    if (saved) return saved;
    const cohort = isNew ? 'new' : 'existing';
    await AsyncStorage.setItem(COHORT_KEY, cohort);
    if (isNew) await AsyncStorage.setItem(FIRST_KEY, todayStr);
    return cohort;
  } catch {
    return 'existing'; // 決められない端末では数えない
  }
}

/** 新しく入れた端末のときだけ送る。 */
export async function trackStage(event) {
  try {
    if ((await AsyncStorage.getItem(COHORT_KEY)) === 'new') await trackOnce(event);
  } catch { /* 数えないだけ */ }
}

/** 使い始めて7日・30日以上たって開いたか。 */
export async function trackRetention(todayStr) {
  try {
    if ((await AsyncStorage.getItem(COHORT_KEY)) !== 'new') return;
    const first = await AsyncStorage.getItem(FIRST_KEY);
    if (!first) return;
    const days = Math.floor((Date.parse(todayStr) - Date.parse(first)) / 86400000);
    if (days >= 7) await trackOnce('m_retain_d7');
    if (days >= 30) await trackOnce('m_retain_d30');
  } catch { /* 数えないだけ */ }
}
