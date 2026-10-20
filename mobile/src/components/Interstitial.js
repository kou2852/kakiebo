// 記帳8件ごとの全画面広告（ゲストのみ。間隔は utils/adPacing.js の EVERY）。
//
// 出すのは記帳を保存し終えた直後だけ（出す回は「短い広告が流れます」を1秒出してから）。入力の途中に割り込むと
// AdMob のポリシー（予期しないタイミングの全画面広告）に反する。
// ログインしたユーザーには出さない。登録してくれた人の使い勝手は落とさない。
//
// 数えるのは、記帳タブ・ショートカット・レシート撮影から新しく保存した記帳だけ。
// 編集・CSV 取り込み・定期取引の自動記帳・開始残高は、自分で1件ずつ付けた記帳ではないので数えない。
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Platform } from 'react-native';
import { ADS_ENABLED, USE_TEST_ADS } from './Ad';
import { useAuth } from '../store/AuthProvider';
import { useData } from '../store/DataProvider';
import { useToast } from '../store/ToastProvider';
import { bump, isDue, left } from '../utils/adPacing';
import { maybeAskReview } from './ReviewAsk';
import { isAdFreeNow } from '../adFree';

let Ads = null;
try { Ads = require('react-native-google-mobile-ads'); } catch { Ads = null; }

// 本番のユニットID（AdMob: kurofukubo iOS / 記帳5回ごと全画面（ゲスト））。
// 静止画と動画の両方、1人1時間2回までは AdMob 側で設定している。
const PROD_UNIT_ID = Platform.OS === 'android' ? 'ca-app-pub-1494837719359912/4898378467' : 'ca-app-pub-1494837719359912/5602407892';
const COUNT_KEY = 'ads.entryCount';

// 読み込みを待つ上限。超えたら諦めて、件数は戻さず次の記帳へ持ち越す
const LOAD_TIMEOUT_MS = 5000;

// 出す番になってから読み込む（先読みはしない。アプリを終了すると捨てられるうえ、出さない回の通信も要らない）。
// 読み込めたら広告を、失敗・時間切れなら null を返す
function loadAd() {
  if (!Ads || !ADS_ENABLED) return Promise.resolve(null);
  const { InterstitialAd, AdEventType, TestIds } = Ads;
  const a = InterstitialAd.createForAdRequest(USE_TEST_ADS ? TestIds.INTERSTITIAL : PROD_UNIT_ID, {
    // バナーと同じく非パーソナライズに固定する（ATT の許可ダイアログを出さない）
    requestNonPersonalizedAdsOnly: true,
  });
  return new Promise((resolve) => {
    let settled = false;
    const settle = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (!ok) a.removeAllListeners(); // 時間切れのあとに読み込めても出さない
      resolve(ok ? a : null);
    };
    const timer = setTimeout(() => settle(false), LOAD_TIMEOUT_MS);
    a.addAdEventListener(AdEventType.LOADED, () => settle(true));
    a.addAdEventListener(AdEventType.ERROR, (e) => {
      console.warn(`[全画面広告] 読み込み失敗 code=${e?.code ?? '?'} ${e?.message ?? ''}`);
      settle(false);
    });
    a.load();
  });
}

const readCount = async () => Number(await AsyncStorage.getItem(COUNT_KEY)) || 0;

// 数えたあとの件数。数えない人・数えられなかったときは null
async function countEntry(guest) {
  if (!guest) return null;
  try {
    const n = bump(await readCount(), guest);
    await AsyncStorage.setItem(COUNT_KEY, String(n));
    return n;
  } catch { return null; /* 数えられなくても記帳は済んでいる */ }
}

/** あと何件の記帳で全画面の広告が出るか（ホームの「広告を消す」のカードに出す）。読めなければ null */
export async function entriesUntilAd() {
  try { return left(await readCount()); } catch { return null; }
}

// 保存の確認に添える一言。広告が出ない人（ログイン中・広告を消した日・広告の無い版）には出さない。
// 出す番の回は確認を出さずに広告へ進む（dueNow）ので、ここは「あと何件」だけ
async function noteFor(n) {
  if (n == null || !Ads || !ADS_ENABLED) return null;
  if (await isAdFreeNow().catch(() => false)) return null;
  const k = left(n);
  return k > 0 ? `あと ${k} 件の記帳で、全画面の広告が出ます。` : null;
}

// 数えたあとの件数 n で、この保存のあとにそのまま広告へ進むか（出す番・広告のある版・広告を消していない）
async function dueNow(guest, n) {
  if (!guest || n == null || !Ads || !ADS_ENABLED || !isDue(n)) return false;
  return !(await isAdFreeNow().catch(() => false));
}

// 読み込みの間に「短い広告が流れます」を出しておく。読み込みが速くても、これだけは最低この時間見せる
const NOTICE_MS = 1000;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let busy = false;

// 出せたら true。呼び出し側は、この回に評価を聞くかどうかの判断に使う。
async function showIfDue(guest, notify) {
  if (!guest || !Ads || !ADS_ENABLED || busy) return false;
  busy = true; // 続けて保存しても、読み込みを重ねない
  try {
    // 動画を見て「今日は広告を消す」にしている間は出さない。件数は進めたまま（切れたあと最初の番で出る）
    if (await isAdFreeNow()) return false;
    if (!isDue(await readCount())) return false;
    notify('短い広告が流れます');
    const [a] = await Promise.all([loadAd(), wait(NOTICE_MS)]);
    if (!a) return false; // 読み込めなかった回は件数を戻さず、次の記帳でもう一度
    a.addAdEventListener(Ads.AdEventType.CLOSED, () => a.removeAllListeners());
    await AsyncStorage.setItem(COUNT_KEY, '0');
    await a.show();
    return true;
  } catch { return false; /* 出せなければ出さない。記帳の操作は止めない */ } finally { busy = false; }
}

// 記帳を保存したら finish({ title, message, onClose }) を呼ぶ。数えて、保存の確認を出し、閉じたあとに広告と評価のお願いを続けて扱う。
// 広告を出す回は、確認を出さずに onClose → 「短い広告が流れます」（読み込み中）→ 広告へ進む（OK を押させない）。
// 広告と評価のお願いを同じ瞬間に出さないため、順番はここでまとめる。
export function useEntryAd() {
  const guest = !useAuth()?.signedIn;
  const { journals } = useData();
  const toast = useToast();

  const closed = () => {
    showIfDue(guest, toast).then((adShown) => maybeAskReview({ journals: journals?.length || 0, adShown }));
  };

  return {
    finish: async ({ title, message, onClose }) => {
      const n = await countEntry(guest);
      if (await dueNow(guest, n)) { onClose?.(); closed(); return; }
      const note = await noteFor(n).catch(() => null);
      Alert.alert(title, `${message}${note ? `\n\n${note}` : ''}`, [
        { text: 'OK', onPress: () => { onClose?.(); closed(); } },
      ]);
    },
  };
}
