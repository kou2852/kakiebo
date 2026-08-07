import { useState, useEffect, useMemo, useRef } from 'react';
import { useData } from '../../contexts/DataContext';
import { faBal, fas, ACCOUNT_TYPES, today } from '../../utils/format';
import { CODE_BASE, EQUITY_ID, nextCode } from '../../utils/accountCode';
import { calcBalances, accountBalance, isInvestmentAsset } from '../../utils/bookkeeping';
import { lastClosingDate } from '../../utils/creditCard';
import { useToast } from '../Common/Toast';
import InfoTip from '../Common/InfoTip';
import Modal from '../Common/Modal';

// 相手科目の選択肢で「評価損益をその場で作る」を表す番兵値
const CREATE_PL = '__create_pl__';

export default function AccountModal({ open, onClose, editId, defaultType, prefill }) {
  const { accounts, journals, addAccount, updateAccount, addJournal } = useData();
  const toast = useToast();

  const [name, setName] = useState('');
  const [type, setType] = useState('asset');
  const [code, setCode] = useState('');
  const [note, setNote] = useState('');
  const [ccClose, setCcClose] = useState('');
  const [ccDay, setCcDay] = useState('');
  const [ccDelay, setCcDelay] = useState('1');
  const [ccFrom, setCcFrom] = useState('');
  const [useCard, setUseCard] = useState(false);
  // カード欄に触ったか。既存の「設定しかけ」科目で、名前を直したいだけの編集まで
  // 止めないための目印（触っていなければ既存値をそのまま通す）。
  const [ccTouched, setCcTouched] = useState(false);
  const [openingBalance, setOpeningBalance] = useState('');
  const [actualBalance, setActualBalance] = useState('');
  const [counterId, setCounterId] = useState('');
  const [adjusting, setAdjusting] = useState(false);
  const nameRef = useRef(null);
  const balanceRef = useRef(null);

  const assetAccounts = useMemo(() => accounts.filter((a) => a.type === 'asset'), [accounts]);

  // ── 残高合わせ（既存科目の帳簿残高を、実際の残高に合わせる）──
  // 「開始残高」と違って差額だけを記帳するので、同じ数字で何度実行しても増えない。
  const editing = useMemo(() => accounts.find((a) => a.id === editId), [accounts, editId]);
  const showAdjust = !!editId && (editing?.type === 'asset' || editing?.type === 'liability');
  const bookBalance = useMemo(
    () => (editId ? accountBalance(editId, accounts, calcBalances(journals, accounts)) : 0),
    [editId, accounts, journals]
  );
  // 差額の相手科目。投資性の資産は評価損益（含み損益）、それ以外は元入金を既定にする。
  const counterOptions = useMemo(
    () => accounts.filter((a) => a.type === 'equity' || a.type === 'income' || a.type === 'expense')
      .sort((a, b) => (a.code || '').localeCompare(b.code || '')),
    [accounts]
  );
  // 「評価損益」は既定科目に入れたが、それ以前に登録した人は持っていない。
  // 無いまま元入金へ倒すと、評価益が「自分で入れた元手」として記帳され損益計算書に出ないので、
  // その場で作れる選択肢を出す（作成はユーザーが実行したときだけ）。
  const plAccount = useMemo(() => accounts.find((a) => a.name === '評価損益'), [accounts]);
  const needsPl = !!editing && isInvestmentAsset(editing) && !plAccount;
  const defaultCounterId = useMemo(() => {
    if (editing && isInvestmentAsset(editing)) {
      if (plAccount) return plAccount.id;
      return CREATE_PL;
    }
    return accounts.some((a) => a.id === EQUITY_ID) ? EQUITY_ID : (counterOptions[0]?.id || '');
  }, [editing, accounts, counterOptions, plAccount]);

  const adjustDiff = Math.round(parseFloat(String(actualBalance).replace(/[¥,，]/g, '')) || 0) - bookBalance;
  // 締め日はフォームの値で見る。既定の「クレジットカード」科目は引き落とし設定を持たないので、
  // 保存済みの値だけを見ていると、いま締め日を入れてもカード扱いにならない。
  const formCcClose = parseInt(ccClose) || 0;
  const isCardInput = type === 'liability' && useCard && formCcClose > 0;

  // 「カードとして使う」をONにしたら、よくある締め日・引落日と引落口座を先に入れておく。
  // 空欄のまま保存されると3つ揃わず、クレジット画面から静かに消えてしまうため。
  const defaultCcFrom = () => assetAccounts.find((a) => a.name === '普通預金')?.id || assetAccounts[0]?.id || '';
  const toggleUseCard = (on) => {
    setUseCard(on);
    setCcTouched(true);
    if (on && !ccClose && !ccDay && !ccFrom) {
      setCcClose('15'); setCcDay('27'); setCcDelay('1'); setCcFrom(defaultCcFrom());
    }
  };
  const setCc = (setter) => (v) => { setter(v); setCcTouched(true); };
  const adjustLabel = editing?.type === 'asset' ? '実際の残高'
    : isCardInput ? '次回の引落額' : '実際の残高・借入額';

  // 残高合わせ欄の初期化。入力中に他の再描画で消えないよう、本体のフォームとは別の効果にする
  useEffect(() => {
    if (!open) return;
    setActualBalance('');
    setCounterId('');
  }, [open, editId]);

  const handleAdjust = async () => {
    if (adjusting || !editing) return;
    if (!String(actualBalance).trim()) { toast('実際の残高を入力してください'); return; }
    const diff = adjustDiff;
    if (!diff) { toast('帳簿の残高と一致しています'); return; }
    const picked = counterId || defaultCounterId;
    if (!picked) { toast('差額の相手科目を選んでください'); return; }
    const amount = Math.abs(diff);
    // 資産は増える＝借方、負債は増える＝貸方
    const selfSide = editing.type === 'asset' ? (diff > 0 ? 'dr' : 'cr') : (diff > 0 ? 'cr' : 'dr');
    setAdjusting(true);
    try {
      let cid = picked;
      if (cid === CREATE_PL) {
        const made = await addAccount({ name: '評価損益', type: 'income', code: nextCode(accounts, 'income'), note: '' });
        cid = made.id;
      }
      const lines = [
        { accountId: editing.id, side: selfSide, amount, taxRate: 0 },
        { accountId: cid, side: selfSide === 'dr' ? 'cr' : 'dr', amount, taxRate: 0 },
      ].sort((a, b) => (a.side === 'dr' ? 0 : 1) - (b.side === 'dr' ? 0 : 1));
      // カードは直前の締め日に置く（次回の引き落としに乗せる）。それ以外は今日。
      const date = formCcClose ? lastClosingDate(formCcClose) : today();
      await addJournal({ date, desc: `残高合わせ（${editing.name}）`, lines }, { silent: true });
      toast('残高を合わせました');
      // 閉じない。引き落とし設定など未保存のフォーム入力を捨てないため（帳簿残高の表示は自動で更新される）
      setActualBalance('');
    } catch { toast('記帳に失敗しました'); }
    finally { setAdjusting(false); }
  };

  useEffect(() => {
    if (!open) return;
    if (editId) {
      const a = accounts.find((x) => x.id === editId);
      if (a) {
        setName(a.name); setType(a.type); setCode(a.code || ''); setNote(a.note || '');
        setCcClose(a.ccClose || ''); setCcDay(a.ccDay || ''); setCcDelay(String(a.ccDelay || 1)); setCcFrom(a.ccFrom || '');
        // 1つでも入っていればカードとして設定しかけている
        setUseCard(!!(a.ccClose || a.ccDay || a.ccFrom));
        setCcTouched(false);
      }
    } else {
      // テンプレから開いた場合は内容をプリフィル（編集して保存できる）。
      // テンプレのコードが既に使われていれば、その区分の未使用最小コードに差し替える。
      const initialType = prefill?.type || defaultType || 'asset';
      const wantedCode = prefill?.code;
      const codeTaken = wantedCode && accounts.some((a) => a.code === wantedCode);
      const initialCode = wantedCode && !codeTaken ? wantedCode : nextCode(accounts, initialType);
      setName(prefill?.name || ''); setType(initialType);
      setCode(initialCode);
      setNote('');
      // テンプレのクレカ（コード21xx or 名称にカード）は最初からON＋よくある既定値。ローン系はOFF。
      const cardOn = initialType === 'liability'
        && (/^21/.test(String(initialCode)) || /カード/.test(prefill?.name || ''));
      setUseCard(cardOn);
      setCcClose(cardOn ? '15' : ''); setCcDay(cardOn ? '27' : '');
      setCcDelay('1'); setCcFrom(cardOn ? defaultCcFrom() : '');
      setCcTouched(false);
      setOpeningBalance('');
    }
  }, [open, editId, accounts, defaultType, prefill]);

  // 開始残高は新規の資産・負債科目のみ（収益・費用・純資産は「フロー」の科目で開始残高という概念がない）
  const showOpeningBalance = !editId && (type === 'asset' || type === 'liability');

  // 開いたら、いちばん価値のある入力（残高がある新規口座なら残高欄、それ以外は科目名）へフォーカスを合わせる
  useEffect(() => {
    if (!open) return;
    const t = requestAnimationFrame(() => (showOpeningBalance ? balanceRef : nameRef).current?.focus());
    return () => cancelAnimationFrame(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, showOpeningBalance]);

  // 新規作成時は、区分を変えたらその区分の未使用最小コードを自動で入れ直す（編集時はコードを保持）
  const handleTypeChange = (newType) => {
    setType(newType);
    if (!editId) setCode(nextCode(accounts, newType));
  };

  const handleSave = async () => {
    if (!name.trim()) { toast('科目名を入力してください'); return; }
    const trimmedCode = code.trim();
    if (trimmedCode && accounts.some((a) => a.code === trimmedCode && a.id !== editId)) {
      toast(`コード${trimmedCode}は既に使われています`); return;
    }
    const data = { name: name.trim(), type, code: trimmedCode, note: note.trim() };
    if (type === 'liability') {
      if (!useCard) {
        data.ccClose = 0; data.ccDay = 0; data.ccDelay = 1; data.ccFrom = '';
      } else {
        // 3つ揃わないとクレジット画面から静かに消えるので、揃っていることを保証する。
        // ただし検証するのは新規のときと、既存でカード欄に触ったときだけ。変更前からある
        // 設定しかけの科目で、名前を直すだけの編集まで止めないため（未検証なら現状のまま通す）。
        if (!editId || ccTouched) {
          if (!(parseInt(ccClose) > 0)) { toast('締め日を入力してください'); return; }
          if (!(parseInt(ccDay) > 0)) { toast('引落日を入力してください'); return; }
          if (!ccFrom) { toast('引落口座を選んでください'); return; }
        }
        data.ccClose = parseInt(ccClose) || 0;
        data.ccDay = parseInt(ccDay) || 0;
        data.ccDelay = parseInt(ccDelay) || 1;
        data.ccFrom = ccFrom || '';
      }
    }
    try {
      if (editId) {
        await updateAccount(editId, data);
      } else {
        const created = await addAccount(data);
        // 開始残高：資産は (借)新科目/(貸)元入金、負債（既存の借金）は (借)元入金/(貸)新科目
        const bal = Math.round(parseFloat(String(openingBalance).replace(/[¥,，]/g, '')) || 0);
        if (showOpeningBalance && bal > 0) {
          const lines = type === 'asset'
            ? [{ accountId: created.id, side: 'dr', amount: bal, taxRate: 0 }, { accountId: EQUITY_ID, side: 'cr', amount: bal, taxRate: 0 }]
            : [{ accountId: EQUITY_ID, side: 'dr', amount: bal, taxRate: 0 }, { accountId: created.id, side: 'cr', amount: bal, taxRate: 0 }];
          // カードの開始残高は「次回の引落額」。直前の締め日に置くと次回引落のサイクルに乗る
          const date = data.ccClose ? lastClosingDate(data.ccClose) : today();
          await addJournal({ date, desc: `開始残高（${name.trim()}）`, lines }, { silent: true });
        }
      }
      toast('保存しました');
      onClose();
    } catch { toast('保存に失敗しました'); }
  };

  return (
    <Modal open={open} onClose={onClose} title={editId ? '科目編集' : '科目追加'}
      footer={<><button className="btn btn-g" onClick={onClose}>キャンセル</button><button className="btn btn-p" onClick={handleSave}>保存</button></>}>

      <div style={{ display: 'grid', gap: 10 }}>
        <div className="fg"><label className="fl">科目名</label><input ref={nameRef} type="text" className="fc" maxLength={50} value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="fg"><label className="fl">区分</label>
          <select className="fc" value={type} onChange={(e) => handleTypeChange(e.target.value)}>
            {Object.entries(ACCOUNT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="fg"><label className="fl">コード</label>
          <input type="number" className="fc" inputMode="numeric"
            min={CODE_BASE[type] + 1} max={CODE_BASE[type] + 999} step="1"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ''))}
            onKeyDown={(e) => { if (['e', 'E', '+', '-', '.'].includes(e.key)) e.preventDefault(); }}
          />
        </div>
        <div className="fg"><label className="fl">備考</label><input type="text" className="fc" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} /></div>
        {showOpeningBalance && (
          <div className="fg" data-tour="opening-balance">
            <label className="fl">{type === 'asset' ? 'いまの残高（任意）' : isCardInput ? '次回の引落額（任意）' : 'いまの残高・借入額（任意）'}</label>
            <input ref={balanceRef} type="text" inputMode="numeric" className="fc" placeholder="例: 100000" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} />
            <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 4 }}>
              {isCardInput
                ? '請求が確定して、まだ引き落とされていない額（カード会社アプリの「今月のお支払い金額」）を入れてください。締め日以降の利用分は、これから記帳する分で積み上がります。'
                : '入力すると、保存と同時に純資産へ反映されます'}
            </div>
          </div>
        )}
      </div>

      {type === 'liability' && (
        <div style={{ marginTop: 14, padding: 12, border: '1px solid var(--bd)', borderRadius: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ac)', marginBottom: 8 }}>
            引き落とし設定
            <InfoTip text="締め日・引落日・引落口座の3つが揃うと、クレジット画面に利用と引き落としのサイクルが出て、返済仕訳をまとめて記帳できるようになります。1つでも欠けるとこれらの機能は動きません。" />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
            <input type="checkbox" checked={useCard} onChange={(e) => toggleUseCard(e.target.checked)} />
            カードとして使う（締め日と引き落としを管理する）
          </label>
          {useCard ? (
            <div style={{ marginTop: 10 }}>
              <div className="form-row">
                <div className="fg"><label className="fl">締め日（毎月）</label><input type="number" className="fc" min="1" max="31" placeholder="15" value={ccClose} onChange={(e) => setCc(setCcClose)(e.target.value)} /></div>
                <div className="fg"><label className="fl">引落日（毎月）</label><input type="number" className="fc" min="1" max="31" placeholder="27" value={ccDay} onChange={(e) => setCc(setCcDay)(e.target.value)} /></div>
              </div>
              <div className="form-row mt-6">
                <div className="fg"><label className="fl">引き落とし月</label>
                  <select className="fc" value={ccDelay} onChange={(e) => setCc(setCcDelay)(e.target.value)}>
                    <option value="1">翌月</option><option value="2">翌々月</option>
                  </select>
                </div>
                <div className="fg"><label className="fl">引落口座</label>
                  <select className="fc" value={ccFrom} onChange={(e) => setCc(setCcFrom)(e.target.value)}>
                    <option value="">— 選択 —</option>
                    {assetAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--tx3)' }}>
                {/カード/.test(name)
                  ? 'クレジットカードなら、チェックを入れて締め日・引落日・引落口座を設定してください。'
                  : '住宅ローンや奨学金など、締め日のない負債はチェック不要です。'}
              </div>
              {editing && (editing.ccClose || editing.ccDay || editing.ccFrom) && (
                <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>
                  保存すると、いまの引き落とし設定が消えます（クレジット画面からもこのカードが外れます）。
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showAdjust && (
        <div style={{ marginTop: 14, padding: 12, border: '1px solid var(--bd)', borderRadius: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ac)', marginBottom: 10 }}>
            残高合わせ
            <InfoTip text="帳簿の残高を、実際の残高に合わせます。差額だけを記帳するので、同じ金額で何度実行しても二重に増えることはありません。iDeCo・NISA など投資資産の毎月の評価替えにも使えます。" />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, color: 'var(--tx2)', marginBottom: 10 }}>
            <span>いまの帳簿残高</span>
            <span className="mono">{faBal(bookBalance)}</span>
          </div>
          <div className="form-row">
            <div className="fg"><label className="fl">{adjustLabel}</label>
              <input type="text" inputMode="numeric" className="fc" placeholder="0"
                value={actualBalance} onChange={(e) => setActualBalance(e.target.value)} />
            </div>
            <div className="fg"><label className="fl">差額の相手科目</label>
              <select className="fc" value={counterId || defaultCounterId} onChange={(e) => setCounterId(e.target.value)}>
                {needsPl && <option value={CREATE_PL}>＋「評価損益」を作成して使う</option>}
                {counterOptions.map((a) => <option key={a.id} value={a.id}>{a.code ? `${a.code} ` : ''}{a.name}</option>)}
              </select>
            </div>
          </div>
          {isCardInput && (
            <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 6 }}>
              まだ引き落とされていない額（カード会社アプリの「今月のお支払い金額」）。差額は直前の締め日（{lastClosingDate(formCcClose)}）に記帳され、次回の引き落としに乗ります。
            </div>
          )}
          {(counterId || defaultCounterId) === CREATE_PL && (
            <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 6 }}>
              「残高を合わせる」を押すと、収益科目「評価損益」を作成してから記帳します。含み損益が損益計算書に出るようになります。
            </div>
          )}
          {editing?.type === 'liability' && !isCardInput && (
            <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 6 }}>
              上の「引き落とし設定」で<strong>カードとして使う</strong>にチェックを入れると、<strong>次回の引落額</strong>として、次回の引き落としに乗る形で記帳できます。
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: adjustDiff ? 'var(--ac)' : 'var(--tx3)' }}>
              {!String(actualBalance).trim()
                ? '実際の残高を入れると差額を計算します'
                : adjustDiff === 0
                  ? '帳簿の残高と一致しています'
                  : `差額 ${fas(adjustDiff)} を記帳します`}
            </span>
            <button className="btn btn-p btn-s" onClick={handleAdjust} disabled={adjusting || !adjustDiff}>
              {adjusting ? '記帳中…' : '残高を合わせる'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
