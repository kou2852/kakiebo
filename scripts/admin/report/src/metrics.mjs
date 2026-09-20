// 管理ダッシュボード（scripts/admin/server.mjs）と Discord 定時レポート（handler.mjs）で共有する集計ロジック。
// AWS には触れない純粋な関数だけを置く。判定ルールを2か所に書くと、片方だけ直したときに
// 画面と通知で数字が食い違うため、ボット判定・自分IP・ファネル・異常判定の基準はここに一本化する。
//
// ログ解析ロジックは docs/design-gen/analyze-cflogs.mjs と同一。

// 既知の自分IPプレフィックス（変動あり）。IPv6は再接続で変わるため、増えたら追記する。
// 判定は前方一致なので、除外漏れに気づいたら `curl https://api64.ipify.org` で現IPを確認して足す。
export const SELF_PREFIXES = ['240d:f:a2c:6300', '240d:1f:a2c:6300', '240f:6e:e188:'];
export const BOT = /bot|spider|crawl|checker|ruby|preview|slurp|fetch|facebookexternalhit|embedly|monitoring|headless|curl|wget|python-requests|python-httpx|okhttp|axios|node-fetch|libwww|winhttp|go-http-client|scan|nmap|nikto|sqlmap|masscan|censys|shodan|palo alto networks/i;
export const SUSPICIOUS_QUERY = /phpinfo|\.env(\W|$)|wp-admin|wp-login|eval\(|union(\s|%20)+select|\.\.\/|etc\/passwd/i;
export const dec = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
// 現行ブラウザは自動更新されるため、極端に古いバージョン文字列は偽装/スキャンツールの兆候
export const isOutdatedUa = (ua) => {
  const chrome = ua.match(/Chrome\/(\d+)/);
  if (chrome && Number(chrome[1]) < 110) return true;
  const ios = ua.match(/CPU iPhone OS (\d+)_/);
  if (ios && Number(ios[1]) < 15) return true;
  return false;
};

// 集計と表示は日本時間で行う。CloudFront のログはUTCなので、日付だけを見ると
// 朝9時より前の利用が前日に計上され、見ている感覚と1日ずれる。
// 日付+時刻から +9時間して、本当のJST日に振り直す。
export const JST_OFFSET = 9 * 3600 * 1000;
export const jstDay = (date, time) => new Date(Date.parse(`${date}T${time}Z`) + JST_OFFSET).toISOString().slice(0, 10);
export const jstDayOfIso = (iso) => new Date(Date.parse(iso) + JST_OFFSET).toISOString().slice(0, 10);

// 基準時刻から直近 days 日ぶんの日付文字列(YYYY-MM-DD、JST)を返す（基準日を含む）
export function lastDays(days, now = Date.now()) {
  const out = [];
  const t = now + JST_OFFSET;
  for (let i = 0; i < days; i++) {
    out.push(new Date(t - i * 86400000).toISOString().slice(0, 10));
  }
  return out;
}

/**
 * 展開済みのログ本文（複数ファイル）を行に分解する。
 * self判定に使う selftest の送信元は、期間で絞る前に集める。期間内の行だけから集めると
 * self の集合が期間ごとに変わり、同じ日の数字が期間の切替でずれる（7日と90日で違う値が出る）。
 * @param {Iterable<string>} texts
 * @param {Set<string>} wanted 集計対象のJST日付
 */
export function parseLogs(texts, wanted) {
  const rows = [];
  const selfIps = new Set();
  for (const txt of texts) {
    for (const line of txt.split('\n')) {
      if (!line || line[0] === '#') continue;
      const c = line.split('\t');
      if (c.length < 12) continue;
      if (/selftest/i.test(dec(c[11]))) selfIps.add(c[4]); // 期間外の行からも拾う
      const date = jstDay(c[0], c[1]);                     // UTCログ → JST日
      if (!wanted.has(date)) continue;                     // 期間外を除外
      rows.push({ date, time: c[1], ip: c[4], uri: c[7], status: c[8], ref: c[9], ua: c[10], q: c[11] });
    }
  }
  return { rows, selfIps };
}

/** 行を人間・ボット・自分に分類する */
export function classify(rows, selfIps) {
  const isSelf = (ip) => SELF_PREFIXES.some((p) => ip.startsWith(p)) || selfIps.has(ip);
  const opens = rows.filter((r) => r.uri === '/' || r.uri === '/index.html');

  // バースト検知: 同一IP+UA+同一秒に3回以上のオープンは人間の閲覧挙動ではなく自動スキャン
  const burstKey = (r) => r.ip + '|' + r.ua + '|' + r.date + '|' + r.time;
  const burstCount = {};
  for (const r of opens) { const k = burstKey(r); burstCount[k] = (burstCount[k] || 0) + 1; }
  const isBurst = (r) => burstCount[burstKey(r)] >= 3;
  const isBot = (r) => BOT.test(dec(r.ua)) || SUSPICIOUS_QUERY.test(dec(r.q)) || isBurst(r) || isOutdatedUa(dec(r.ua));

  const humanOpens = opens.filter((r) => !isBot(r) && !isSelf(r.ip));
  const botOpens = opens.filter((r) => isBot(r));
  const selfOpens = opens.filter((r) => !isBot(r) && isSelf(r.ip));
  return { isBot, isSelf, isBurst, opens, humanOpens, botOpens, selfOpens };
}

/** 自前イベント計測(/_e/*、bot/self除外)を合計と日別で数える */
export function countEvents(rows, isBot, isSelf) {
  const total = {}, byDay = {};
  for (const r of rows) {
    const m = r.uri && r.uri.match(/^\/_e\/([a-z0-9_-]+)$/i);
    if (!m || isBot(r) || isSelf(r.ip)) continue;
    const name = m[1];
    total[name] = (total[name] || 0) + 1;
    ((byDay[r.date] ||= {})[name] = (byDay[r.date][name] || 0) + 1);
  }
  return { total, byDay };
}

/** イベント合計から獲得ファネル・入口の内訳・継続を組み立てる */
export function funnelOf(evTotal) {
  const n = (k) => evTotal[k] || 0;

  // 獲得ファネル。各段はブラウザごとに1回だけ発火するイベント＝「人数」として読める。
  // 起動(app_first)を分母に、どこで落ちているかを見る。
  // auth_view はここに入れない：?guest で来た人はログイン画面を通らないため、
  // 「ログイン画面を見た」は「ゲスト開始」の上位集合にならず、前段比が意味を持たない。
  const funnel = [
    { key: 'app_first', label: '起動（新規訪問）', count: n('app_first') },
    { key: 'guest_first', label: 'ゲスト開始', count: n('guest_first') },
    { key: 'first_journal', label: '初回記帳', count: n('first_journal') },
    // ログのビーコン。Google は「このブラウザで初めてログインした」時点で発火するため、
    // 既存ユーザーの別端末ログインも数える＝獲得数ではない。実際の登録数は
    // 上部KPI（Cognito由来）が正。同じ画面で「登録」が2つ並んで取り違えるのを避け、名前を分けた。
    { key: 'registered', label: '初回ログイン(端末別)', count: n('registered') },
  ];
  const base = funnel[0].count;
  for (const f of funnel) f.rate = base ? Number(((f.count / base) * 100).toFixed(1)) : null;

  // 入口の内訳。ログイン画面に当たった人と、LPから ?guest で直行した人の比率。
  const av = n('auth_view');
  const entry = {
    authView: av,
    authRate: base ? Number(((av / base) * 100).toFixed(1)) : null,
    direct: Math.max(0, base - av),
    directRate: base ? Number((((base - av) / base) * 100).toFixed(1)) : null,
  };

  // 継続。分母は「ゲスト開始した人」。d1 ≥ d7 ≥ d30 の絞り込みになる。
  const gf = n('guest_first');
  const retention = [
    { key: 'retain_d1', label: '翌日以降に再訪', count: n('retain_d1') },
    { key: 'retain_d7', label: '7日以降に再訪', count: n('retain_d7') },
    { key: 'retain_d30', label: '30日以降に再訪', count: n('retain_d30') },
  ];
  for (const r of retention) r.rate = gf ? Number(((r.count / gf) * 100).toFixed(1)) : null;

  return { funnel, entry, retention };
}

// ── 登録ユーザー（Cognito）──────────────────────────────────

// 連合ログインのプロバイダは Username の接頭辞で分かる（Cognito が付ける）。
// 'Google_xxx' / 'SignInWithApple_xxx' / それ以外はメール登録（Username は sub）。
//
// ⚠ 以前は EXTERNAL_PROVIDER を全部「Google」に寄せていた。合計は合うが、
//   Apple を入れた効果が測れない。最初の Apple 利用者が来る前に直しておく。
export const providerOf = (username) => (username?.startsWith('Google_') ? 'google'
  : username?.startsWith('SignInWithApple_') ? 'apple' : 'email');

/**
 * 登録ユーザーの集計。UNCONFIRMED＝メール登録で確認コードを通していない人。利用に至っていないため本数から除く。
 * @param {Array<[status: string, createdIso: string, username: string]>} users
 * @param {number|null} since この時刻(ms)以降の新規登録を inPeriod / byDay に数える。null なら期間指定なし
 */
export function summarizeUsers(users, since) {
  const by = {};
  for (const [s] of users) by[s] = (by[s] || 0) + 1;
  const unconfirmed = by.UNCONFIRMED || 0;

  const byProvider = { google: 0, apple: 0, email: 0 };
  for (const [st, , un] of users) if (st !== 'UNCONFIRMED') byProvider[providerOf(un)]++;

  // 期間内の新規登録。ログのビーコンではなく Cognito の作成日時を正とする。
  // ビーコン(registered)は Google のログインも数えてしまうので獲得数には使えない。
  const inPeriod = since == null ? null
    : users.filter(([s, created]) => s !== 'UNCONFIRMED' && new Date(created).getTime() >= since).length;

  // 日別の新規登録。日付はJSTで切る（アクセスログ側もJSTに揃えてあるため）。
  const dayMap = {};
  for (const [s, created, un] of users) {
    if (s === 'UNCONFIRMED') continue;
    const t = new Date(created).getTime();
    if (since != null && t < since) continue;
    const day = jstDayOfIso(created);
    const e = (dayMap[day] ||= { date: day, count: 0, google: 0, apple: 0, email: 0 });
    e.count++;
    e[providerOf(un)]++;
  }
  const byDay = Object.keys(dayMap).sort().map((k) => dayMap[k]);

  // 本数は「全件 − 未確認」。RESET_REQUIRED 等の未知の状態が出ても本数側に入り取りこぼさない
  return {
    total: users.length - unconfirmed,
    unconfirmed,
    google: byProvider.google,         // Googleログイン。確認コードの概念がなく常に確認済み
    apple: byProvider.apple,           // Sign in with Apple。同上
    email: byProvider.email,           // メール登録で確認コードを通した人
    inPeriod,                          // 期間内の新規登録（null = 期間指定なし）
    byDay,                             // 期間内の新規登録の日別内訳（登録があった日のみ）
  };
}

/** 作成日時が [from, to) に入る確認済みユーザーの数 */
export function countCreated(users, from, to) {
  return users.filter(([s, created]) => {
    if (s === 'UNCONFIRMED') return false;
    const t = new Date(created).getTime();
    return t >= from && t < to;
  }).length;
}

// ── 問い合わせ ────────────────────────────────────────────

/** 最後がユーザー発言＝こちらの返信待ち */
export const isWaitingInquiry = (t) => t.status !== 'closed' && t.lastFrom === 'user';

// ── 状態の判定（常に真であるべきこと）──────────────────────────
// ダッシュボードの「状態」タブと Discord レポートで同じ基準を使う。
// 各行は { level: 'ok'|'warn'|'bad', label, value, note }。取得に失敗した値は null で渡す。

/**
 * 前提チェック。
 * @param {object} raw
 * @param {object|null} raw.pool Cognito の EmailConfiguration（取得失敗は null）
 * @param {boolean|null} raw.sesProduction SES の本番アクセス有無（取得失敗は null）
 * @param {string[]|null} raw.unconfirmedCreated 未確認ユーザーの作成日時（取得失敗は null）
 * @param {number|null|undefined} raw.cleanupLastTs 掃除ジョブの直近3日の最終実行(ms)。実行なしは null、取得失敗は undefined
 * @param {number} now
 */
export function judgeChecks({ pool, sesProduction, unconfirmedCreated, cleanupLastTs }, now) {
  const out = [];
  const add = (level, label, value, note = null) => out.push({ level, label, value, note });

  // 1) メール送信の経路。SESがサンドボックスのまま SesIdentityArn を入れると
  //    未検証アドレスへ確認コードが1通も届かなくなる（2026-08-02〜09 に実際に起きた）
  const sending = pool?.EmailSendingAccount || '不明';
  if (pool == null) add('warn', 'メール送信の経路', '取得できず');
  else if (sending === 'DEVELOPER' && sesProduction === false) {
    add('bad', 'メール送信の経路', 'SES経由 × サンドボックス',
      '未検証アドレスに確認コードが届きません。SesIdentityArn を空にしてください');
  } else add('ok', 'メール送信の経路', sending === 'COGNITO_DEFAULT' ? 'Cognito標準送信' : sending);

  // 2) 確認されないまま滞留しているサインアップ。放置すると本人が再登録できない
  if (unconfirmedCreated == null) add('warn', '未確認のまま滞留', '取得できず');
  else if (!unconfirmedCreated.length) add('ok', '未確認のまま滞留', 'なし');
  else {
    const oldest = unconfirmedCreated.reduce((m, d) => Math.max(m, (now - new Date(d).getTime()) / 86400000), 0);
    add(oldest >= 3 ? 'warn' : 'ok', '未確認のまま滞留',
      `${unconfirmedCreated.length}件 / 最長 ${oldest.toFixed(1)}日`, oldest >= 3 ? '掃除ジョブが次回削除します' : null);
  }

  // 3) 掃除ジョブが実際に動いているか（EventBridge の設定ではなく実行ログを見る）
  if (cleanupLastTs === undefined) add('warn', '掃除ジョブの前回実行', '取得できず');
  else if (!cleanupLastTs) add('warn', '掃除ジョブの前回実行', '直近3日で実行なし', 'スケジュールを確認してください');
  else {
    const h = (now - Number(cleanupLastTs)) / 3600000;
    add(h > 30 ? 'warn' : 'ok', '掃除ジョブの前回実行', `${h.toFixed(0)}時間前`);
  }

  return { checks: out, emailSending: sending, sesProduction: sesProduction ?? null };
}

/** 本番が実際に返している CSP。headers は { csp: 'enforce'|'report-only'|'none'|'both' }、取得失敗は null */
export function judgeCsp(headers) {
  const label = 'CSP が強制モード';
  if (!headers) return { level: 'warn', label, value: '取得できず', note: null };
  const value = { enforce: 'enforce', 'report-only': '記録のみ', none: 'なし', both: '両方' }[headers.csp];
  return headers.csp === 'enforce'
    ? { level: 'ok', label, value, note: null }
    : { level: 'bad', label, value, note: '記録するだけで実際には防いでいません' };
}

/** 監視の4指標（24時間）。s は getSignals の戻り値、取得失敗は null */
export function judgeSignals(s) {
  if (!s) return [{ level: 'warn', label: '監視の4指標', value: '取得できず', note: null }];
  return [
    { level: s.err5 > 0 ? 'bad' : 'ok', label: 'エラー率（5xx）',
      value: s.errorRate.toFixed(2) + '%  (' + s.err5 + '/' + s.requests + ')', note: null },
    { level: s.p99 > 3000 ? 'bad' : (s.p99 > 1000 ? 'warn' : 'ok'), label: '遅延 p99',
      value: Math.round(s.p99) + ' ms', note: s.p99 > 1000 ? '1秒超。Lambdaのコールドスタートの可能性' : null },
    { level: 'ok', label: '流量（API呼び出し）', value: s.requests + ' 回', note: null },
    { level: s.lambdaErrors > 0 ? 'bad' : 'ok', label: 'Lambda エラー',
      value: s.lambdaErrors + ' / ' + s.lambdaInvocations + ' 実行', note: null },
    { level: (s.lambdaThrottles + s.ddbThrottles) > 0 ? 'bad' : 'ok', label: 'スロットル（飽和）',
      value: 'Lambda ' + s.lambdaThrottles + ' / DynamoDB ' + s.ddbThrottles, note: null },
  ];
}

/** 取得した生の指標から signals を組み立てる（CloudWatch の MetricDataResults の Id→値） */
export function signalsOf(v) {
  return {
    requests: v.count, err5: v.e5, err4: v.e4, p99: v.p99,
    lambdaErrors: v.lerr, lambdaInvocations: v.linv, lambdaThrottles: v.lthr,
    ddbThrottles: v.dthr,
    errorRate: v.count ? (v.e5 / v.count) * 100 : 0,
  };
}

/** 監視の4指標のクエリ定義（CloudWatch GetMetricData） */
export function signalQueries(apiName, tableName) {
  const q = (Id, Namespace, MetricName, Stat, Dimensions) => ({
    Id, MetricStat: { Metric: { Namespace, MetricName, ...(Dimensions ? { Dimensions } : {}) }, Period: 86400, Stat },
  });
  const api = [{ Name: 'ApiName', Value: apiName }];
  return [
    q('count', 'AWS/ApiGateway', 'Count', 'Sum', api),
    q('e5', 'AWS/ApiGateway', '5XXError', 'Sum', api),
    q('e4', 'AWS/ApiGateway', '4XXError', 'Sum', api),
    q('p99', 'AWS/ApiGateway', 'Latency', 'p99', api),
    q('lerr', 'AWS/Lambda', 'Errors', 'Sum'),
    q('linv', 'AWS/Lambda', 'Invocations', 'Sum'),
    q('lthr', 'AWS/Lambda', 'Throttles', 'Sum'),
    q('dthr', 'AWS/DynamoDB', 'ThrottledRequests', 'Sum', [{ Name: 'TableName', Value: tableName }]),
  ];
}

/** レスポンスヘッダから CSP の状態を読む */
export function cspStateOf(csp, reportOnly) {
  return csp ? (reportOnly ? 'both' : 'enforce') : (reportOnly ? 'report-only' : 'none');
}

/**
 * 問い合わせ・ご意見の新着通知（13:00 と 17:00）が動いているか。
 * 失敗のたびに通知するとレポート用チャンネルが荒れるため、止まっていることは定時レポート側で知らせる。
 * 1日2回なので、朝10:00のレポートから見た前回実行は前日17:00（17時間前）が正常。
 * 2回続けて飛んだ状態（丸1日近く動いていない）だけを注意にする。
 * @param {{lastRunAt?: string}|null} cursor 取得失敗も null
 */
export function judgeWatch(cursor, now) {
  const label = '新着通知の前回確認';
  if (!cursor?.lastRunAt) return { level: 'warn', label, value: '記録なし', note: '新着の確認がまだ動いていません' };
  const m = (now - Date.parse(cursor.lastRunAt)) / 60000;
  return m > 20 * 60
    ? { level: 'warn', label, value: `${Math.round(m)}分前`, note: '問い合わせ・ご意見の通知が止まっています' }
    : { level: 'ok', label, value: `${Math.round(m)}分前`, note: null };
}
