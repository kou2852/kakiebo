const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

// 主要KPI（大きく出す用）。unit は数字の後ろに付く小さい単位。
function lead(n, unit, l, s, accent){
  return '<div class="kpi'+(accent?' acc':'')+'"><div class="l">'+l+'</div>'
       + '<div class="n">'+n+(unit?'<u>'+unit+'</u>':'')+'</div>'
       + (s?'<div class="s">'+s+'</div>':'')+'</div>';
}

/* ── 自前イベント識別子の日本語化 ────────────────────────
   unit: '人' = ブラウザごとに1回だけ送るイベント / '回' = 毎回送るイベント */
const TOUR_STEP = {'welcome':'ようこそ','account-add':'口座の追加','networth':'純資産','first-journal':'最初の記帳','done':'完了','sample':'サンプル'};
const EV_MAP = {
  app_open:        {g:'獲得',    ja:'起動',                   u:'回'},
  app_first:       {g:'獲得',    ja:'初回起動（新規訪問者）', u:'人'},
  auth_view:       {g:'獲得',    ja:'ログイン画面を見た',     u:'人'},
  guest_start:     {g:'獲得',    ja:'ゲスト開始',             u:'回'},
  guest_first:     {g:'獲得',    ja:'ゲスト開始',             u:'人'},
  guest_return:    {g:'継続',    ja:'既存ゲストの再訪',       u:'回'},
  journal_added:   {g:'獲得',    ja:'ゲストの記帳',           u:'回'},
  first_journal:   {g:'獲得',    ja:'初回記帳',               u:'人'},
  registered:      {g:'獲得',    ja:'初回ログイン(端末別)',    u:'回'},
  retain_d1:       {g:'継続',    ja:'1日後に再訪',            u:'人'},
  retain_d7:       {g:'継続',    ja:'7日後に再訪',            u:'人'},
  retain_d30:      {g:'継続',    ja:'30日後に再訪',           u:'人'},
  account_deleted: {g:'継続',    ja:'退会',                   u:'人'},
  ios_badge_click: {g:'獲得',    ja:'App Storeへ（更新情報から）', u:'回'},
  ios_soon_shown:  {g:'獲得',    ja:'アプリ準備中の案内を表示', u:'人'},
  ios_promo_shown: {g:'獲得',    ja:'アプリ案内を表示',        u:'人'},
  ios_promo_click: {g:'獲得',    ja:'App Storeへ（案内から）', u:'人'},
  ios_preorder_click:{g:'獲得',  ja:'予約注文へ（アプリ内から）', u:'回'},
  feedback_shown:  {g:'アンケート', ja:'アンケート表示',      u:'回'},
  feedback_shown_monthly:{g:'アンケート', ja:'月次アンケート表示', u:'回'},
  feedback_sent:   {g:'アンケート', ja:'アンケート送信',      u:'回'},
  tour_done:       {g:'ツアー',  ja:'ツアー完走',             u:'回'},
  tour_done_acted: {g:'ツアー',  ja:'完走かつ記帳',           u:'回'},
  tour_sample:     {g:'ツアー',  ja:'サンプル閲覧',           u:'回'},
  // モバイルアプリ（mobile/src/store/TrackSync.jsx）。新しく入れた端末だけ・端末ごとに1回
  m_onboard_done:  {g:'アプリ',  ja:'オンボーディング完了',   u:'人'},
  m_opening:       {g:'アプリ',  ja:'口座の残高を入力',       u:'人'},
  m_card_set:      {g:'アプリ',  ja:'カードの締め日・引落を設定', u:'人'},
  m_first_journal: {g:'アプリ',  ja:'初回記帳',               u:'人'},
  m_tag_alloc:     {g:'アプリ',  ja:'タグ配分を設定',         u:'人'},
  m_intro_tour:    {g:'アプリ',  ja:'ホームの案内でツアーを選択', u:'人'},
  m_retain_d7:     {g:'アプリ',  ja:'7日後に再訪',            u:'人'},
  m_retain_d30:    {g:'アプリ',  ja:'30日後に再訪',           u:'人'}
};
function evInfo(name){
  if(EV_MAP[name]) return EV_MAP[name];
  if(name.indexOf('tour_step_')===0){
    const k = name.slice(10);
    return {g:'ツアー', ja:'到達: '+(TOUR_STEP[k]||k), u:'回'};
  }
  if(name.indexOf('tour_skip_')===0){
    const k = name.slice(10);
    return {g:'ツアー', ja:'離脱: '+(TOUR_STEP[k]||k), u:'回'};
  }
  return {g:'その他', ja:name, u:'回'};
}
const GROUPS = ['獲得','ツアー','アプリ','継続','アンケート','その他'];
// ⚠ iOS Safari は「Web」に入る。ここでいう iOSアプリ は App Store 版のこと。
const PF_JA = {ios:'iPhoneアプリ', android:'Androidアプリ', web:'ブラウザ', unknown:'不明（UA未記録）', other:'その他'};

// タブは見る頻度の順。今日=毎日（壊れていないか・対応すること・昨日と今日） / 成長=週1回（伸びているか）
// 声=毎日（返信・ご意見・退会） / 深掘り=必要時（なぜそうなったか）
const TABS = ['today', 'access', 'voice', 'deep'];
let tab = 'today';
let statsCache = null; // 成長と深掘りは同じデータを使うので取り直さない
let pfCache = {};      // 端末別は期間ごとに別取得（深掘りの絞り込みで何度も描き直すため）
// 読み込みは数秒かかることがある。待っている間にタブを切り替えると、
// 後から返ってきた古い応答が新しい画面を上書きしてしまう。世代番号で捨てる。
let gen = 0;
const stale = (g) => g !== gen;
let fresh = false;     // 「更新」を押した次の読み込みだけ、サーバーがとっておいた結果を使わない
let pfFresh = false;   // 端末別の分（本体と別に取りに行くため別のフラグ）
let pendingAnchor = null;

// ── 取得 ──
async function api(path, force){
  const r = await fetch(path + (force ? (path.indexOf('?') >= 0 ? '&' : '?') + 'fresh=1' : ''));
  let d;
  try{ d = await r.json(); }catch(e){ throw new Error('応答を読めませんでした（' + r.status + '）'); }
  if(!r.ok || d.error) throw new Error(d.error || 'エラー');
  return d;
}
const errBox = (e) => '<div class="err">' + esc(e.message) + '</div>';
// ブロックごとの取得時刻。サーバーがとっておいた結果なら「保持」と添える
const stampOf = (d) => d && d.generatedAt
  ? '<span class="stamp">取得 ' + esc(String(d.generatedAt).slice(11, 16)) + (d.cached ? '（保持）' : '') + '</span>' : '';
function setBusy(b){ $('#refresh').disabled = b; $('#refresh').textContent = b ? '取得中…' : '更新'; }
const md = (s) => String(s).slice(5).replace('-', '/');
function waitLabel(ms){
  const m = Math.floor(ms / 60000);
  if(m < 60) return m + '分';
  const h = Math.floor(m / 60);
  return h < 48 ? h + '時間' : Math.floor(h / 24) + '日';
}

// ── 前回見た時刻（ブラウザに持つ。声タブを最後まで開いた時刻） ──
const SEEN_KEY = 'kk_admin_voice_seen';
function readSeen(){ try{ const v = localStorage.getItem(SEEN_KEY); return v ? Number(v) : null; }catch(e){ return null; } }
function writeSeen(ms){ try{ localStorage.setItem(SEEN_KEY, String(ms)); }catch(e){ /* 持てなくても画面は使える */ } }
let seenAt = readSeen();
if(seenAt == null){ seenAt = Date.now(); writeSeen(seenAt); } // 初回は、いまある分を全部「新着」にしない
const isNewFb = (it, from) => Date.parse(it.timestamp) > (from == null ? seenAt : from);
const isNewDel = (it, from) => Date.parse(it.at.replace(' ', 'T') + ':00+09:00') > (from == null ? seenAt : from);

// 声の3つ（今日の「対応すること」・タブの件数・声タブで共有する）
const voice = { inq: null, fb: null, del: null };
const VOICE_API = { inq: '/api/inquiries', fb: '/api/feedback', del: '/api/deletions' };
function loadVoiceData(kind, force){
  return api(VOICE_API[kind], force).then(function(d){ voice[kind] = d; paintBadge(); return d; });
}
function paintBadge(){
  const n = (voice.inq ? voice.inq.waiting : 0)
    + (voice.fb ? voice.fb.items.filter((x) => isNewFb(x)).length : 0)
    + (voice.del ? voice.del.items.filter((x) => isNewDel(x)).length : 0);
  $('#badge-voice').textContent = n ? String(n) : '';
}

function setTab(t, anchor){
  tab = t;
  gen++; // 進行中の読み込みの結果を無効にする
  pendingAnchor = anchor || null;
  for (const k of TABS) $('#tab-' + k).className = t === k ? 'on' : '';
  // 期間の切替が意味を持つのは成長と深掘りだけ
  const showPeriod = (t === 'access' || t === 'deep');
  $('#period-picker').style.display = showPeriod ? '' : 'none';
  $('#period').style.display = showPeriod ? '' : 'none';
  try{ history.replaceState(null, '', '#' + t); }catch(e){ /* アドレスを書き換えられなくても動く */ }
  load();
}

function load(){
  if(tab === 'today') return loadToday();
  if(tab === 'voice') return loadVoice();
  return loadStats();
}

// ブロックごとに、取れたものから順に差し込む。遅いブロックを待たせない
function slot(sel, g, p, fn){
  return p.then(function(d){ if(!stale(g) && $(sel)){ $(sel).innerHTML = fn(d); } return d; })
          .catch(function(e){ if(!stale(g) && $(sel)){ $(sel).innerHTML = errBox(e); } throw e; });
}

// ── 今日 ──────────────────────────────────────────────────────
// 毎日これだけ見て閉じられる画面。上から「壊れていないか」「対応すること」「昨日と今日」。
const ico = { ok: '<span class="st-ok">●</span>', warn: '<span class="st-warn">▲</span>', bad: '<span class="st-bad">✕</span>' };
const chkRow = (x) => '<div class="chk">' + ico[x.level] + '<span>' + esc(x.label)
  + (x.note ? '<br><span class="chk-note">' + esc(x.note) + '</span>' : '') + '</span>'
  + '<span class="chk-v">' + esc(String(x.value)) + '</span></div>';

const todayState = { status: null, num: null };

function statusRows(s, num){
  const rows = [].concat(s.checks.checks || [], [s.judged.csp, s.judged.hsts, s.judged.watch], s.judged.signals || []);
  if(num){
    const unknown = num.eventNames.filter((e) => evInfo(e.name).g === 'その他');
    rows.push(unknown.length
      ? { level: 'warn', label: '一覧にないイベント', value: unknown.length + '種類', note: unknown.map((e) => e.name + ' ' + e.count).join(' / ') }
      : { level: 'ok', label: '一覧にないイベント', value: 'なし', note: null });
    rows.push({ level: num.cspReports > 0 ? 'warn' : 'ok', label: 'CSPの違反報告（直近9日）', value: num.cspReports + ' 件',
      note: num.cspReports > 0 ? 'ブラウザが自動で送る報告。利用者のイベントには入れていない' : null });
  }
  return rows;
}

function statusHtml(s, num){
  const rows = statusRows(s, num);
  const rank = { bad: 2, warn: 1, ok: 0 };
  const cnt = [0, 0, 0];
  rows.forEach((x) => { cnt[rank[x.level] || 0]++; });
  const worst = cnt[2] ? 2 : (cnt[1] ? 1 : 0);
  let h = '<div class="verdict ' + ['v-ok', 'v-warn', 'v-bad'][worst] + '"><b>' + ['異常なし', '注意', '要対応'][worst] + '</b>'
    + '<span>赤 ' + cnt[2] + ' ／ 黄 ' + cnt[1] + ' ／ 緑 ' + cnt[0] + '</span></div>';
  const bad = rows.filter((x) => x.level !== 'ok'), ok = rows.filter((x) => x.level === 'ok');
  if(bad.length) h += '<section><h3>確認が必要</h3>' + bad.map(chkRow).join('') + '</section>';
  if(ok.length) h += '<details><summary>正常 <span>' + ok.length + '件</span></summary><div class="in">' + ok.map(chkRow).join('') + '</div></details>';
  return h;
}

function numbersHtml(n){
  let h = '<section><div class="wrap"><table class="ntab"><tr><th>項目</th>'
    + '<th class="num">昨日<small>' + esc(md(n.yesterday)) + ' 確定</small></th>'
    + '<th class="num today">今日<small>' + esc(md(n.today)) + ' <span class="tag-partial">途中</span></small></th>'
    + '<th class="num">7日平均<small>昨日まで</small></th></tr>';
  for(const r of n.rows){
    h += '<tr><td>' + esc(r.label) + (r.note ? '<div class="rn">' + esc(r.note) + '</div>' : '') + '</td>'
       + '<td class="num">' + r.yesterday + '</td><td class="num today">' + r.today + '</td>'
       + '<td class="num">' + r.avg7 + '</td></tr>';
  }
  return h + '</table></div></section>';
}

function todoCard(anchor, html){ return '<a class="card-link" href="#voice" data-go="voice" data-anchor="' + anchor + '">' + html + '</a>'; }

function loadToday(){
  const g = gen, force = fresh;
  fresh = false;
  setBusy(true);
  todayState.status = null; todayState.num = null;
  const waiting = (txt) => '<div class="kpi"><div class="l">' + txt + '</div><div class="n muted">…</div></div>';
  $('#root').innerHTML =
    '<div class="band"><h2>状態</h2><span id="s-status"></span></div><div id="b-status"><p class="muted">AWSに問い合わせ中…</p></div>'
    + '<div class="band"><h2>対応すること</h2><span class="hint">クリックで「声」へ</span></div>'
    + '<div class="lead"><div id="c-inq">' + waiting('返信待ちの問い合わせ') + '</div><div id="c-fb">' + waiting('新着のご意見') + '</div>'
    + '<div id="c-del">' + waiting('新着の退会') + '</div></div>'
    + '<div class="band"><h2>昨日と今日</h2><span class="hint">日本時間の暦日。今日は途中の値</span><span id="s-num"></span></div>'
    + '<div id="b-num"><p class="muted">ログを集計中…</p></div>';

  const paint = () => {
    if(stale(g) || !todayState.status) return;
    $('#b-status').innerHTML = statusHtml(todayState.status, todayState.num);
  };
  const pStatus = api('/api/status', force).then(function(d){
    todayState.status = d; paint();
    if(!stale(g)) $('#s-status').innerHTML = stampOf(d);
  }).catch(function(e){ if(!stale(g)) $('#b-status').innerHTML = errBox(e); });
  const pNum = api('/api/today', force).then(function(d){
    todayState.num = d;
    if(!stale(g)){ $('#b-num').innerHTML = numbersHtml(d); $('#s-num').innerHTML = stampOf(d); }
    paint();
  }).catch(function(e){ if(!stale(g)) $('#b-num').innerHTML = errBox(e); });

  const card = (sel, kind, fn) => slot(sel, g, loadVoiceData(kind, force), fn).catch(function(){});
  const pInq = card('#c-inq', 'inq', function(d){
    const w = d.items.filter((t) => t.waiting);
    const oldest = w.length ? Math.max.apply(null, w.map((t) => Date.now() - Date.parse((t.messages[t.messages.length - 1] || {}).at || t.updatedAt))) : 0;
    return todoCard('v-inq', lead(d.waiting, '件', '返信待ちの問い合わせ', w.length ? '最も古いもの ' + waitLabel(oldest) + ' 待ち' : 'スレッド総数 ' + d.total + '件', d.waiting > 0));
  });
  const pFb = card('#c-fb', 'fb', function(d){
    const n = d.items.filter((x) => isNewFb(x)).length;
    return todoCard('v-fb', lead(n, '件', '新着のご意見', '前回見た後に届いた分（総数 ' + d.total + '件）', n > 0));
  });
  const pDel = card('#c-del', 'del', function(d){
    const n = d.items.filter((x) => isNewDel(x)).length;
    return todoCard('v-del', lead(n, '件', '新着の退会', '前回見た後の分（直近90日 ' + d.total + '件）', n > 0));
  });
  Promise.all([pStatus, pNum, pInq, pFb, pDel]).then(function(){ if(!stale(g)) setBusy(false); });
}

// ── 声 ────────────────────────────────────────────────────────
function threadHtml(t){
  let h = '<div class="fb"><div class="when">' + esc(t.sub) + '… ／ ' + esc((t.updatedAt || '').replace('T', ' ').slice(0, 16))
    + (t.waiting ? ' ／ <b class="wait-tag">返信待ち</b>' : '') + (t.status === 'closed' ? ' ／ 終了' : '') + '</div>';
  h += '<div class="body"><b>' + esc(t.subject || '（件名なし）') + '</b></div>';
  for(const m of t.messages){
    h += '<div class="body msg ' + (m.from === 'staff' ? 'staff' : 'user') + '"><span class="muted">'
      + (m.from === 'staff' ? '運営' : 'ユーザー') + ' ' + esc((m.at || '').replace('T', ' ').slice(0, 16))
      + '</span><br>' + esc(m.body) + '</div>';
  }
  if(t.status !== 'closed'){
    h += '<div class="reply"><textarea class="rp" rows="3" data-sk="' + esc(t.sk) + '" placeholder="返信を書く"></textarea>'
      + '<button class="rp-send" data-table="' + esc(t.table) + '" data-pk="' + esc(t.pk) + '" data-sk="' + esc(t.sk) + '">返信する</button> '
      + '<label class="muted"><input type="checkbox" class="rp-close" data-sk="' + esc(t.sk) + '"> 送信して終了にする</label>'
      + ' <span class="rp-err" data-sk="' + esc(t.sk) + '"></span></div>';
  }
  return h + '</div>';
}

function inquiriesHtml(d){
  let h = '<div class="band"><h2>問い合わせ</h2><span class="hint">ログイン済みユーザーとのやり取り（メールアドレスは保持していない）</span>' + stampOf(d) + '</div>';
  h += '<div class="lead lead2">' + lead(d.waiting, '件', '返信待ち', 'こちらの返答が必要', true) + lead(d.total, '件', 'スレッド総数', '全期間') + '</div>';
  if(!d.items.length) return h + '<section><p class="muted">まだ届いていません。</p></section>';
  const waiting = d.items.filter((t) => t.waiting);
  const replied = d.items.filter((t) => !t.waiting && t.status !== 'closed');
  const closed = d.items.filter((t) => t.status === 'closed');
  if(waiting.length) h += waiting.map(threadHtml).join('');
  else h += '<section><p class="muted">返信待ちはありません。</p></section>';
  if(replied.length) h += '<details><summary>返信済み・未終了 <span>' + replied.length + '件</span></summary><div class="in">' + replied.map(threadHtml).join('') + '</div></details>';
  if(closed.length) h += '<details><summary>終了 <span>' + closed.length + '件</span></summary><div class="in">' + closed.map(threadHtml).join('') + '</div></details>';
  return h + '<p class="foot"><span>本文はサポート対応のため表示している。表示は sub の先頭8桁。</span></p>';
}

function bindReplies(g){
  document.querySelectorAll('.rp-send').forEach(function(btn){
    btn.addEventListener('click', async function(){
      const sk = btn.dataset.sk, key = CSS.escape(sk);
      const ta = document.querySelector('textarea.rp[data-sk="' + key + '"]');
      const close = document.querySelector('.rp-close[data-sk="' + key + '"]').checked;
      const err = document.querySelector('.rp-err[data-sk="' + key + '"]');
      if(!ta.value.trim()) return;
      btn.disabled = true; btn.textContent = '送信中…'; err.textContent = '';
      try{
        const r = await fetch('/api/inquiry-reply', { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ table: btn.dataset.table, pk: btn.dataset.pk, sk: sk, body: ta.value, close: close }) });
        const j = await r.json();
        if(!r.ok || j.error) throw new Error(j.error || '失敗');
        // 送ったあとは問い合わせだけを取り直す
        const d = await loadVoiceData('inq', true);
        if(!stale(g) && $('#v-inq')){ $('#v-inq').innerHTML = inquiriesHtml(d); bindReplies(g); }
      }catch(e){ err.textContent = e.message; btn.disabled = false; btn.textContent = '返信する'; }
    });
  });
}

function feedbackHtml(d, from){
  let h = '<div class="band"><h2>ご意見</h2><span class="hint">アプリ内アンケートの自由記述（匿名）</span>' + stampOf(d) + '</div>';
  const thisMonth = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 7);
  // 今月が0件のとき、いちばん新しい月（先月）の件数を「今月分」と出さない
  const cur = d.byMonth.find((m) => m.month === thisMonth);
  h += '<div class="lead lead2">' + lead(d.total, '件', 'ご意見の総数', '全期間', true) + lead(cur ? cur.count : 0, '件', '今月分', thisMonth) + '</div>';
  if(d.byMonth.length){
    h += '<section><h3>月別の件数</h3><div class="months">';
    for(const m of d.byMonth) h += '<div class="month"><b>' + m.count + '</b>' + esc(m.month) + '</div>';
    h += '</div></section>';
  }
  if(!d.items.length) return h + '<section><p class="muted">まだ届いていません。</p></section>';
  for(const it of d.items){
    const nw = isNewFb(it, from);
    h += '<div class="fb' + (nw ? ' new' : '') + '"><div class="when">' + esc((it.timestamp || '').replace('T', ' ').slice(0, 16))
      + (nw ? ' <span class="newtag">新着</span>' : '') + '</div><div class="body">' + esc(it.body) + '</div></div>';
  }
  return h;
}

function deletionsHtml(d, from){
  let h = '<div class="band"><h2>退会</h2><span class="hint">直近90日（ログの保持期間）・時刻は日本時間</span>' + stampOf(d) + '</div>';
  h += '<div class="lead">' + lead(d.total, '件', '退会', d.self ? 'うち自分のIPから ' + d.self + '件' : '', true)
    + lead(d.withReason, '件', '理由あり') + lead(d.total - d.withReason, '件', '理由の記入なし') + '</div>';
  if(!d.items.length) return h + '<section><p class="muted">記録がありません。</p></section>';
  for(const it of d.items){
    const note = it.self ? ' · 自分のIPから' : (it.recorded ? '' : ' · アクセスログに退会の記録なし');
    const nw = isNewDel(it, from);
    h += '<div class="fb' + (nw ? ' new' : '') + '"><div class="when">' + esc(it.at) + esc(note)
      + (nw ? ' <span class="newtag">新着</span>' : '') + '</div>'
      + '<div class="body' + (it.reason ? '' : ' muted') + '">' + (it.reason ? esc(it.reason) : '（理由の記入なし）') + '</div></div>';
  }
  return h + '<p class="foot"><span>理由は任意入力で、ログにだけ残しています（DBには保存しない）。</span></p>';
}

function loadVoice(){
  const g = gen, force = fresh, from = seenAt; // 新着の印は、開く前に見ていた時刻を基準にする
  fresh = false;
  setBusy(true);
  const waiting = (t) => '<div class="band"><h2>' + t + '</h2></div><p class="muted">取得中…</p>';
  $('#root').innerHTML =
    '<nav class="subnav"><a data-go="voice" data-anchor="v-inq">問い合わせ</a><a data-go="voice" data-anchor="v-fb">ご意見</a>'
    + '<a data-go="voice" data-anchor="v-del">退会</a></nav>'
    + '<div id="v-inq">' + waiting('問い合わせ') + '</div><div id="v-fb">' + waiting('ご意見') + '</div><div id="v-del">' + waiting('退会') + '</div>';
  const p = [
    slot('#v-inq', g, loadVoiceData('inq', force), inquiriesHtml).then(function(){ if(!stale(g)) bindReplies(g); }),
    slot('#v-fb', g, loadVoiceData('fb', force), function(d){ return feedbackHtml(d, from); }),
    slot('#v-del', g, loadVoiceData('del', force), function(d){ return deletionsHtml(d, from); }),
  ];
  Promise.allSettled(p).then(function(rs){
    if(stale(g)) return;
    setBusy(false);
    if(rs.every((r) => r.status === 'fulfilled')){ seenAt = Date.now(); writeSeen(seenAt); paintBadge(); } // 3つとも見えたときだけ「見た」とする
    if(pendingAnchor && $('#' + pendingAnchor)) $('#' + pendingAnchor).scrollIntoView({ block: 'start' });
    pendingAnchor = null;
  });
}

// ── 成長・深掘り（ログの集計） ──────────────────────────────────
async function loadStats(){
  const g = gen, force = fresh;
  fresh = false;
  const days = $('#days').value;
  // 成長と深掘りは同じ集計を使う。期間が同じなら取り直さない
  if(!force && statsCache && statsCache.__days === days){
    return tab === 'deep' ? renderDeep(statsCache) : render(statsCache);
  }
  setBusy(true);
  $('#root').innerHTML = '<p class="muted">アクセスログを集計中…</p>';
  try{
    const d = await api('/api/stats?days=' + days, force);
    d.__days = days; statsCache = d; // 取得自体は無駄にしない（次のタブで使う）
    if(stale(g)) return;
    if(tab === 'deep') renderDeep(d); else render(d);
  }catch(e){ if(!stale(g)) $('#root').innerHTML = errBox(e); }
  finally{ if(!stale(g)) setBusy(false); }
}


function funnelSection(d){
  const f = d.events.funnel || [];
  // 先頭（起動）が0なら分母が無く率を出せない。配信直後は registered など既存イベントだけが
  // 値を持ち、それが満杯のバーとして描かれて誤読を招くため、揃うまでは表示しない。
  const has = f.length > 0 && f[0].count > 0;
  const ev = Object.fromEntries(d.events.total.map(e=>[e.name,e.count]));
  let h = '<div class="cols">';
  h += '<section><h3>獲得ファネル <small>人数（ブラウザ単位）／ 起動を100%とした割合</small></h3>';
  if(!has){
    h += '<p class="muted">計測イベントの配信直後です。数字が入るまで1日ほどお待ちください。'
       + '（判定に使う localStorage のキーは計測導入時点では誰も持っていないため、'
       + '長く使っている人も次の訪問で1回ずつ計上されます。最初の数日は新規訪問者が'
       + '実態より多く出ます）</p>';
  }else{
    const max = Math.max(...f.map(x=>x.count), 1);
    h += '<div class="fn-hd"><div>段階</div><div></div><div>人数</div><div>起動比</div><div>前段比</div></div><div class="fn">';
    let prev = null;
    for(const s of f){
      const w = Math.round((s.count / max) * 100);
      let step = '<div class="fn-s first">—</div>';
      if(prev!=null && prev>0){
        const sr = Math.round(s.count / prev * 1000) / 10;
        const drop = prev - s.count;
        step = '<div class="fn-s">'+sr+'%'+(drop>0?'<u>-'+drop+'人</u>':'')+'</div>';
      }
      h += '<div class="fn-r"><div class="fn-l">'+esc(s.label)+'</div>'
         + '<div class="fn-b"><span style="width:'+w+'%"></span></div>'
         + '<div class="fn-n">'+s.count+'<u>人</u></div>'
         + '<div class="fn-p">'+(s.rate==null?'—':s.rate+'%')+'</div>'
         + step+'</div>';
      prev = s.count;
    }
    h += '</div>';
    const en = d.events.entry;
    if(en && en.authRate!=null){
      // ログイン画面は ?guest で来た人が通らないため、ファネルの段には入れず内訳として出す
      h += '<div class="headline"><span class="pair"><span class="k">ログイン画面に当たった</span>'
         + '<span class="v" style="font-size:20px">'+en.authRate+'%</span><span class="f">'+en.authView+'人</span></span>'
         + '<span class="pair"><span class="k">LPから直行（?guest）</span>'
         + '<span class="v" style="font-size:20px">'+en.directRate+'%</span><span class="f">'+en.direct+'人</span></span></div>';
    }
  }
  h += '</section>';

  const r = d.events.retention || [];
  h += '<div>';
  h += '<section><h3>継続 <small>ゲスト開始した人が分母</small></h3>';
  if(!r.some(x=>x.count>0)){
    h += '<p class="muted">まだ計測できていません。retain_d1 は配信の翌日以降、d7 は7日後以降に出はじめます。</p>';
  }else{
    const rmax = Math.max(...r.map(x=>x.rate==null?0:x.rate), 1);
    h += '<div class="ret">';
    for(const x of r){
      const w = Math.round(((x.rate==null?0:x.rate) / rmax) * 100);
      h += '<div class="ret-r"><div class="ret-l">'+esc(x.label)+'</div>'
         + '<div class="ret-b"><span style="width:'+w+'%"></span></div>'
         + '<div class="ret-v">'+(x.rate==null?'—':x.rate+'%')+'<u>'+x.count+'人</u></div></div>';
    }
    h += '</div>';
  }
  h += '<div class="headline">'
     + '<span class="pair"><span class="k">起動 app_open</span><span class="v" style="font-size:20px">'+(d.events.appOpen||0)+'</span><span class="f">回</span></span>'
     + '<span class="pair"><span class="k">既存ゲストの再訪 guest_return</span><span class="v" style="font-size:20px">'+(d.events.guestReturn||0)+'</span><span class="f">回</span></span></div>';
  h += '</section>';

  h += '<section><h3>アクティベーション <small>記帳イベント ÷ ゲスト開始（どちらも回数。人あたりではなく訪問あたり）</small></h3>';
  h += '<div class="headline" style="margin:0;padding:0;border:0">'
     + '<span class="v" style="font-size:34px">'+(d.events.activation==null?'—':d.events.activation)+'</span>'
     + '<span class="f">＝ 記帳イベント(journal_added) '+(ev.journal_added||0)+'回 ÷ ゲスト開始(guest_start) '+(ev.guest_start||0)+'回</span></div>';
  h += '</section></div></div>';
  return h;
}

function render(d){
  $('#period').textContent = d.period.from ? (d.period.from+' 〜 '+d.period.to+'（直近'+d.period.days+'日）') : 'データなし';
  const o = d.opens;
  const ev = Object.fromEntries(d.events.total.map(e=>[e.name,e.count]));

  // 1. 主役の数字
  let h = '<div class="band"><h2>いま</h2><span class="hint">bot・self を除いた人間のアクセス</span></div>';
  h += '<div class="lead">';
  const ru = d.registeredUsers;
  // 「この期間に何人増えたか」。ログのビーコン(registered)ではなく Cognito の登録日時を数える。
  // ビーコンは Google の別端末ログインも拾うので獲得数としては使えない。
  h += lead(ru==null||ru.inPeriod==null?'—':ru.inPeriod, '人', 'この期間の新規登録', 'Cognito の登録日時', true);
  h += lead(ru==null?'—':ru.total, '人', '登録ユーザー数（累計）',
    ru==null ? 'Cognito' : 'Google '+ru.google+' / Apple '+ru.apple+' / メール '+ru.email+(ru.unconfirmed?'（未確認 '+ru.unconfirmed+'）':''));
  h += lead(o.humanDistinct, '人', '実人数', '重複IPを除いた人数');
  h += lead(o.human, '回', '人間の訪問（オープン）', '1人あたり '+(o.humanDistinct?(o.human/o.humanDistinct).toFixed(1):'—')+'回');
  h += '</div>';
  h += '<div class="sub"><span class="t">ノイズ</span>'
     + '<span class="i">ボット <b>'+o.bot+'</b> 回</span>'
     + '<span class="i">self（自分） <b>'+o.self+'</b> 回</span>'
     + '<span class="i">全オープン <b>'+o.total+'</b> 回</span></div>';

  // 除外の内訳。「人間0」のとき何で弾かれたのかをここで確認できる
  if(d.excluded && d.excluded.length){
    h += '<details><summary>除外の内訳 <span>'+(o.total-o.human)+'回を除外（人間 '+o.human+'回）</span></summary><div class="in"><div class="wrap">'
       + '<table><tr><th>理由</th><th class="num">件数</th><th>代表的なUser-Agent</th></tr>';
    for(const r of d.excluded){
      h += '<tr><td>'+esc(r.reason)+'</td><td class="num">'+r.count+'</td><td class="ref">'+esc(r.ua||'')+'</td></tr>';
    }
    h += '</table></div></div></details>';
  }

  // 2. ファネルと継続
  h += '<div class="band"><h2>獲得と継続</h2><span class="hint">2026-08-02に計測開始。最初の数日は既存利用者の分が新規として上乗せされる</span></div>';
  h += funnelSection(d);

  // 3. 日別オープン（人間 / bot を別スケールで）
  h += '<div class="band"><h2>推移</h2><span class="hint">直近'+d.period.days+'日</span></div>';

  // 日別の新規登録。件数が少ないので棒グラフにせず、登録があった日だけを新しい順に並べる。
  if(ru && ru.byDay){
    h += '<section><h3>日別の新規登録 <small>Cognito の登録日時（日本時間）。未確認は除く</small></h3>';
    if(!ru.byDay.length){
      h += '<p class="muted">この期間の登録はありません</p>';
    }else{
      h += '<div class="chips">';
      for(const r of [...ru.byDay].reverse()){
        h += '<span class="chip k">'+r.date.slice(5).replace('-','/')+' <b>'+r.count+'</b>'
           + '<span style="color:var(--tx3);font-size:11px">'
           + (r.google?' Google'+r.google:'') + (r.apple?' Apple'+r.apple:'') + (r.email?' メール'+r.email:'') + '</span></span>';
      }
      h += '</div>';
    }
    h += '</section>';
  }

  // 日別の実端末数（DAUの近似）。棒＝端末数、数字も端末数。回数は下の帯で見る。
  h += '<section><h3>日別の実端末数 <small>重複IPを除いた台数。DAUの近似（IPが入れ替わる分やや多め）</small></h3>';
  if(!d.byDay.length){
    h += '<p class="muted">データなし</p>';
  }else{
    const maxD = Math.max(1, ...d.byDay.map(r=>r.distinct||0));
    h += '<div class="chart">';
    for(const r of d.byDay){
      h += '<div class="col" title="'+r.date+' 実端末'+(r.distinct||0)+'台 / 訪問'+r.human+'回">'
         + '<div class="v">'+(r.distinct||0)+'</div>'
         + '<div class="track"><div class="b" style="height:'+Math.max(2,Math.round((r.distinct||0)/maxD*100))+'%"></div></div>'
         + '<div class="x">'+r.date.slice(5).replace('-','/')+'</div></div>';
    }
    h += '</div>';
    const ds = d.byDay.map(r=>r.distinct||0);
    const fixed = ds.slice(0,-1); // 当日は集計途中なので平均・最大から外す
    h += '<div class="sub" style="margin-top:12px"><span class="t">実端末数</span>'
       + '<span class="i">直近（確定日） <b>'+(fixed.length?fixed[fixed.length-1]:'—')+'</b> 台</span>'
       + '<span class="i">平均 <b>'+(fixed.length?(fixed.reduce((a,b)=>a+b,0)/fixed.length).toFixed(1):'—')+'</b> 台</span>'
       + '<span class="i">最大 <b>'+(fixed.length?Math.max(...fixed):'—')+'</b> 台</span>'
       + '<span class="i muted">当日は集計途中のため平均・最大から除外</span></div>';
  }
  h += '</section>';

  h += '<section><h3>日別オープン <small>人間（回）</small></h3>';
  if(!d.byDay.length){
    h += '<p class="muted">データなし</p>';
  }else{
    const maxH = Math.max(1, ...d.byDay.map(r=>r.human));
    const maxB = Math.max(1, ...d.byDay.map(r=>r.bot));
    h += '<div class="chart">';
    for(const r of d.byDay){
      const md = r.date.slice(5).replace('-','/');
      h += '<div class="col" title="'+r.date+' 人間'+r.human+'回 / 実端末'+(r.distinct||0)+'台 / bot'+r.bot+'">'
         + '<div class="v">'+r.human+'</div>'
         + '<div class="track"><div class="b" style="height:'+Math.max(2,Math.round(r.human/maxH*100))+'%"></div></div>'
         + '<div class="x">'+md+'</div></div>';
    }
    h += '</div>';
    h += '<h3 style="margin:20px 0 8px">bot・self <small>人間とは別スケール</small></h3>';
    h += '<div class="chart mini">';
    for(const r of d.byDay){
      h += '<div class="col" title="'+r.date+' bot'+r.bot+' / self'+r.self+'">'
         + '<div class="v'+(r.bot===maxB?' peak':'')+'">'+r.bot+'</div>'
         + '<div class="track"><div class="b bot" style="height:'+Math.max(2,Math.round(r.bot/maxB*100))+'%"></div></div>'
         + '</div>';
    }
    h += '</div>';
    h += '<div class="legend"><span><i></i>人間（回）</span><span><i class="g"></i>bot（回）</span>'
       + '<span>self 合計 '+o.self+'回</span></div>';
  }
  h += '</section>';

  // 「成長」はここまで。以降は「深掘り」タブへ分離した（毎週見る数字と、
  // 疑問が出たときだけ掘る材料を同じ画面に混ぜない）。
  $('#root').innerHTML = h;
}

// 深掘り：なぜそうなったかを調べに来る場所。普段は開かない。
let jFilter = null; // 「どこで消えたか」で選んだ最後のイベント。null = 絞り込みなし

function journeySection(d){
  const j = d.journeys;
  if(!j || !j.visitors.length) return '';
  // 起動しただけで何もしなかった人は行動列から外す（読んでも情報が無いため）。
  // 「どこで消えたか」の集計には残す。そこでは「起動で消えた人数」自体が知りたい数字なので。
  const acted = j.visitors.filter(v=>v.seq.some(s=>s.e!=='app_open'));
  const skipped = j.visitors.length - acted.length;
  const vis = jFilter ? acted.filter(v=>v.last===jFilter) : acted;
  const total = acted.length;

  let h = '<div class="band"><h2>訪問者の行動</h2><span class="hint">'
        + '率では「どこで何をして帰ったか」が分からない。1行＝1人の実際の順序</span></div>';
  h += '<div class="cols">';

  // どこで消えたか（クリックで下の一覧を絞る）
  h += '<section><h3>どこで消えたか</h3><p class="hint">最後に記録されたイベント。クリックでその人たちだけに絞る</p>';
  const max = Math.max(...j.dropoff.map(x=>x.n), 1);
  for(const x of j.dropoff){
    const on = jFilter===x.e;
    h += '<div class="drop-row'+(on?' on':'')+'" data-ev="'+esc(x.e)+'">'
       + '<span class="drop-n">'+x.n+'人</span>'
       + '<span class="drop-bar"><i style="width:'+Math.round(x.n/max*100)+'%"></i></span>'
       + '<span class="drop-e">'+esc(evInfo(x.e).ja)+'</span></div>';
  }
  if(jFilter) h += '<div style="margin-top:8px"><button class="btn-clear" id="j-clear">絞り込みを解除</button></div>';
  h += '</section>';

  // 行動列
  h += '<section><h3>行動列'+(jFilter?'（絞り込み中 '+vis.length+'/'+total+'人）':'（'+total+'人）')+'</h3>';
  h += '<p class="hint">新しい順。IPは表示しない。同一人物の判定はIPなので厳密ではない'
     + (skipped?'／起動しただけの '+skipped+'人は除外（「どこで消えたか」には含む）':'')+'</p>';
  if(!vis.length) h += '<p class="muted">該当なし</p>';
  for(const v of vis.slice(0,25)){
    const badge = v.registered ? '<span class="jb jb-reg">登録</span>'
                : v.writes ? '<span class="jb jb-w">記帳'+v.writes+'</span>' : '';
    h += '<div class="jrow"><div class="jmeta">'
       + '<span>'+esc(v.first.slice(5,16))+'</span>'
       + '<span>'+(v.mobile?'スマホ':'PC')+'</span>'
       + '<span>'+v.days+'日</span>'
       + '<span>'+v.minutes+'分'+(v.sessions>1?'／'+v.sessions+'回':'')+'</span>'
       + '<span class="jref">'+esc(v.ref)+'</span>'
       + badge + '</div><div class="jseq">'
       + v.seq.map(s=>'<span class="jev">'+esc(evInfo(s.e).ja)+(s.n>1?' ×'+s.n:'')+'</span>').join('<i>→</i>')
       + '</div></div>';
  }
  if(vis.length>25) h += '<p class="muted">ほか '+(vis.length-25)+'人</p>';
  h += '</section></div>';
  return h;
}

function platformHtml(p){
  if(!p) return '<p class="muted">APIアクセスログを取得できませんでした</p>';
  if(!p.length) return '<p class="muted">この期間の記録がありません</p>';
  let h = '<div class="wrap"><table><tr><th>端末</th><th class="num">利用者</th><th class="num">記帳</th>'
     + '<th class="num">2日以上使った人</th><th class="num">利用日数の中央値</th><th class="num">リクエスト</th></tr>';
  for(const r of p){
    h += '<tr><td>'+esc(PF_JA[r.platform]||r.platform)+'</td>'
       + '<td class="num">'+r.users+'</td><td class="num">'+r.writes+'</td>'
       + '<td class="num">'+r.returned+'</td><td class="num">'+r.medianDays+'</td>'
       + '<td class="num">'+r.requests+'</td></tr>';
  }
  h += '</table></div>';
  if(p.some(r=>r.platform==='unknown')){
    h += '<p class="hint">「不明」はアクセスログに User-Agent を記録する前の行です。iOSが0件という意味ではありません。</p>';
  }
  return h;
}

// 端末別だけは本体の描画を待たせずに後から入れる（取得に数秒かかるため）
async function loadPlatforms(days){
  const put = (html) => { const el = $('#pf'); if(el) el.innerHTML = html; };
  if(pfCache[days] !== undefined) return put(platformHtml(pfCache[days]));
  const g = gen, force = pfFresh;
  pfFresh = false;
  try{
    const d = await api('/api/platforms?days='+days, force);
    if(stale(g)) return;
    pfCache[days] = d.platforms;
    put(platformHtml(d.platforms));
  }catch(e){ if(!stale(g)) put(errBox(e)); }
}

function renderDeep(d){
  let h = journeySection(d);

  // 3.5 端末別（API Gatewayのアクセスログ）
  h += '<div class="band"><h2>端末別の利用</h2><span class="hint">APIアクセスログ（認証済みのみ／OPTIONS除外）</span></div>';
  h += '<div id="pf"><p class="muted">APIアクセスログを取得中…</p></div>';

  // 4. 自前イベント（種類ごと）
  h += '<div class="band"><h2>自前イベント計測</h2><span class="hint">/_e/*（bot・self除外）／「人」= ブラウザごとに1回、「回」= 毎回</span></div>';
  h += '<div class="cols">';
  h += '<section><h3>期間合計</h3>';
  if(!d.events.total.length){
    h += '<p class="muted">まだイベントがありません</p>';
  }else{
    const byGroup = {};
    for(const e of d.events.total){
      const info = evInfo(e.name);
      (byGroup[info.g] = byGroup[info.g] || []).push({e:e, i:info});
    }
    for(const g of GROUPS){
      const rows = byGroup[g];
      if(!rows) continue;
      h += '<div class="grp"><div class="gt">'+g+'</div>';
      for(const r of rows){
        h += '<div class="ev"><div class="n">'+esc(r.i.ja)+'<code>'+esc(r.e.name)+'</code></div>'
           + '<div class="u">'+r.i.u+'</div>'
           + '<div class="c">'+r.e.count+'<em>'+r.i.u+'</em></div></div>';
      }
      h += '</div>';
    }
  }
  h += '<p class="hint" style="margin-top:12px">CSPの違反報告 <b>'+(d.events.cspReports||0)+'</b> 件'
     + '（ブラウザが自動で送る。利用者のイベントではないので上の一覧には入れない）</p>';
  h += '</section>';

  // 5. 日別の内訳（チップ）
  h += '<section><h3>日別のゲスト開始と記帳 <small>棒=ゲスト開始（回）／濃色=記帳／数字=記帳率</small></h3>';
  if(!d.events.byDay.length){
    h += '<p class="muted">データなし</p>';
  }else{
    const gmax = Math.max(1, ...d.events.byDay.map(r=>r.counts.guest_start||0));
    h += '<div class="chart rate">';
    for(const r of d.events.byDay){
      const g = r.counts.guest_start || 0;
      const j = r.counts.journal_added || 0;
      const rate = g ? Math.round(j/g*1000)/10 : null;
      h += '<div class="col" title="'+r.date+' ゲスト開始'+g+'回 / 記帳'+j+'回">'
         + '<div class="v'+(j?'':' zero')+'">'+(rate==null?'—':rate+'%')+'</div>'
         + '<div class="track"><div class="b" style="height:'+Math.max(2,Math.round(g/gmax*100))+'%">'
         + (j?'<i style="height:'+Math.min(100,Math.round(j/Math.max(g,1)*100))+'%"></i>':'')+'</div></div>'
         + '<div class="x">'+r.date.slice(5).replace('-','/')+'</div></div>';
    }
    h += '</div>';

    h += '<h3 style="margin:20px 0 8px">日別の内訳</h3>';
    for(const r of d.events.byDay){
      const entries = Object.entries(r.counts).sort((a,b)=>b[1]-a[1]);
      const main = entries.filter(en=>evInfo(en[0]).g!=='ツアー');
      const tour = entries.filter(en=>evInfo(en[0]).g==='ツアー');
      const tourSum = tour.reduce((a,en)=>a+en[1], 0);
      h += '<div class="day"><div class="d">'+r.date.slice(5).replace('-','/')+'</div><div class="chips">';
      for(const en of main){
        const info = evInfo(en[0]);
        const key = (en[0]==='guest_start'||en[0]==='journal_added'||en[0]==='registered');
        h += '<span class="chip'+(key?' k':'')+'" title="'+esc(en[0])+'">'+esc(info.ja)+' <b>'+en[1]+'</b></span>';
      }
      if(tour.length){
        h += '<details class="tour"><summary>ツアー '+tour.length+'種 <b>'+tourSum+'</b></summary><div class="chips">';
        for(const en of tour){
          h += '<span class="chip" title="'+esc(en[0])+'">'+esc(evInfo(en[0]).ja)+' <b>'+en[1]+'</b></span>';
        }
        h += '</div></details>';
      }
      h += '</div></div>';
    }
  }
  h += '</section></div>';

  // 6. 流入
  h += '<div class="band"><h2>流入</h2></div>';
  h += '<div class="cols3">';
  h += '<section><h3>媒体別 <small>utm_sourceのみ。タグ無しは媒体不明</small></h3><div class="wrap"><table><tr><th>媒体</th><th class="num">件数</th><th class="num">実人数</th></tr>';
  for(const r of d.bySrc){ h += '<tr><td>'+esc(r.src)+'</td><td class="num">'+r.count+'</td><td class="num muted">'+r.distinct+'</td></tr>'; }
  if(!d.bySrc.length) h += '<tr><td class="muted" colspan="3">データなし</td></tr>';
  h += '</table></div></section>';

  h += '<section><h3>参照元 上位</h3><div class="wrap"><table><tr><th class="num">件数</th><th>Referer</th></tr>';
  for(const r of d.refs){ h += '<tr><td class="num">'+r.count+'</td><td class="ref">'+esc(r.ref)+'</td></tr>'; }
  if(!d.refs.length) h += '<tr><td class="muted" colspan="2">データなし</td></tr>';
  h += '</table></div></section>';
  h += '</div>';

  // 6-2. 記事別のアプリ流入（utm_content）とデバイス別
  h += '<div class="cols3">';
  h += '<section><h3>記事別のアプリ流入 <small>LPのCTA経由（utm_content）。GA4の記事別PVで割るとCTRになる</small></h3>';
  if(!d.byArticle || !d.byArticle.length){
    h += '<p class="muted">まだありません。LPのCTAにutmを付けて配信した後、記事から実際にクリックされると出ます。</p>';
  }else{
    h += '<div class="wrap"><table><tr><th>記事</th><th class="num">クリック</th><th class="num">実人数</th></tr>';
    for(const r of d.byArticle){ h += '<tr><td>'+esc(r.slug)+'</td><td class="num">'+r.count+'</td><td class="num muted">'+r.distinct+'</td></tr>'; }
    h += '</table></div>';
  }
  h += '</section>';

  h += '<section><h3>デバイス別 <small>人間の起動（UA判定）</small></h3><div class="wrap"><table><tr><th>デバイス</th><th class="num">起動</th><th class="num">実人数</th><th class="num">構成比</th></tr>';
  const devTotal = (d.byDevice||[]).reduce((s,x)=>s+x.count,0);
  for(const r of (d.byDevice||[])){
    h += '<tr><td>'+esc(r.name)+'</td><td class="num">'+r.count+'</td><td class="num muted">'+r.distinct+'</td>'
       + '<td class="num">'+(devTotal?(r.count/devTotal*100).toFixed(0)+'%':'—')+'</td></tr>';
  }
  if(!devTotal) h += '<tr><td class="muted" colspan="4">データなし</td></tr>';
  h += '</table></div>';

  // プラットフォーム別。ネイティブアプリの判断に iOS / Android の比率を見る
  h += '<h3 style="margin:20px 0 8px">プラットフォーム別 <small>OS判定。「判定不能」はアプリ内ブラウザ等でUAが削られたもの</small></h3>';
  const pf = d.byPlatform||[];
  const pfTotal = pf.reduce((s,x)=>s+x.count,0);
  if(!pfTotal){
    h += '<p class="muted">データなし</p>';
  }else{
    const mob = pf.filter(r=>/iPhone|iPad|Android/.test(r.name)).reduce((s,x)=>s+x.count,0);
    const ios = pf.filter(r=>/iPhone|iPad/.test(r.name)).reduce((s,x)=>s+x.count,0);
    h += '<div class="wrap"><table><tr><th>プラットフォーム</th><th class="num">起動</th><th class="num">実人数</th><th class="num">構成比</th></tr>';
    for(const r of pf){
      h += '<tr><td>'+esc(r.name)+'</td><td class="num">'+r.count+'</td><td class="num muted">'+r.distinct+'</td>'
         + '<td class="num">'+(r.count/pfTotal*100).toFixed(0)+'%</td></tr>';
    }
    h += '</table></div>';
    h += '<div class="sub" style="margin-top:10px"><span class="t">モバイル</span>'
       + '<span class="i">全体に占める割合 <b>'+(mob/pfTotal*100).toFixed(0)+'%</b></span>'
       + '<span class="i">うち iOS <b>'+(mob?(ios/mob*100).toFixed(0):'—')+'%</b></span>'
       + '<span class="i">うち Android <b>'+(mob?((mob-ios)/mob*100).toFixed(0):'—')+'%</b></span></div>';
  }
  h += '</section>';
  h += '</div>';

  // 7. 参考情報（折りたたみ）
  h += '<div class="band"><h2>参考</h2></div>';
  h += '<details><summary>ボットUA 上位 <span>'+d.botUa.length+'件</span></summary><div class="in"><div class="wrap"><table><tr><th class="num">件数</th><th>User-Agent</th></tr>';
  for(const r of d.botUa){ h += '<tr><td class="num">'+r.count+'</td><td class="ref">'+esc(r.ua)+'</td></tr>'; }
  if(!d.botUa.length) h += '<tr><td class="muted" colspan="2">データなし</td></tr>';
  h += '</table></div></div></details>';

  h += '<details><summary>自分IP <span>'+d.selfIps.length+'件</span></summary><div class="in"><div class="iplist">';
  for(const ip of d.selfIps) h += '<span>'+esc(ip)+'</span>';
  if(!d.selfIps.length) h += '<span class="muted">なし</span>';
  h += '</div></div></details>';

  h += '<p class="foot"><span>集計時刻 '+esc(d.generatedAt)+'</span><span>対象ログファイル '+d.fileCount+'件・'+d.totalRows+'行</span><span>自分IP '+d.selfIps.length+'件</span></p>';
  $('#root').innerHTML = h;

  // 「どこで消えたか」を押すと行動列をその集団だけに絞る。
  // 同じ行を押したら解除（トグル）。データは取り直さず描き直すだけ。
  document.querySelectorAll('.drop-row').forEach(el=>{
    el.addEventListener('click', ()=>{
      jFilter = (jFilter === el.dataset.ev) ? null : el.dataset.ev;
      renderDeep(d);
    });
  });
  const clr = $('#j-clear');
  if(clr) clr.addEventListener('click', ()=>{ jFilter = null; renderDeep(d); });
  loadPlatforms($('#days').value);
}


// 「更新」は明示的な取り直し。サーバーがとっておいた結果も使わない
$('#refresh').addEventListener('click', () => { statsCache = null; pfCache = {}; fresh = true; pfFresh = true; voice.inq = voice.fb = voice.del = null; load(); });
$('#days').addEventListener('change', load); // 期間が変わればキャッシュのキーが外れる
for (const k of TABS) $('#tab-' + k).addEventListener('click', () => setTab(k));
// 「声」へ移るリンク（今日の対応すること・声タブの上の目次）
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-go]');
  if(!a) return;
  e.preventDefault();
  if(tab === 'voice'){ const el = $('#' + a.dataset.anchor); if(el) el.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
  else setTab(a.dataset.go, a.dataset.anchor);
});

// AWS の認証切れは、最初に画面の上で知らせる（各ブロックのエラーにも同じ案内が出る）
fetch('/api/health').then((r) => r.json()).then((h) => {
  if(!h.ok){ const b = $('#banner'); b.textContent = h.message; b.style.display = ''; }
}).catch(() => {});
// 新着の件数はどのタブからでも見えるようにする（取れなければ印を出さないだけ）
for (const k of ['inq', 'fb', 'del']) loadVoiceData(k, false).catch(() => {});
// 初期表示も setTab を通す。直接 load() を呼ぶと期間セレクタの出し分けが効かない
const first = location.hash.slice(1);
setTab(TABS.indexOf(first) >= 0 ? first : 'today');
