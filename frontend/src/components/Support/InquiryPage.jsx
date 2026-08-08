import { useState, useEffect, useCallback } from 'react';
import * as api from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../Common/Toast';
import EmptyState from '../Common/EmptyState';

// 問い合わせ。メールアドレスは受け取らない（ログイン済みなので本人が分かる）。
// 返信はこの画面に出るため、通知は届かない。その旨を明記しておく。
const fmt = (iso) => (iso ? new Date(iso).toLocaleString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

export default function InquiryPage() {
  const { isAuthenticated, guestMode } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [replyBody, setReplyBody] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!isAuthenticated) { setLoading(false); return; }
    try { setItems((await api.inquiries.list()).items || []); }
    catch { toast('問い合わせの読み込みに失敗しました'); }
    finally { setLoading(false); }
  }, [isAuthenticated, toast]);

  useEffect(() => { load(); }, [load]);

  const send = async (e) => {
    e.preventDefault();
    if (!body.trim()) { toast('内容を入力してください'); return; }
    setBusy(true);
    try {
      await api.inquiries.send({ subject: subject.trim(), body: body.trim() });
      setSubject(''); setBody('');
      await load();
      toast('送信しました');
    } catch { toast('送信に失敗しました'); }
    finally { setBusy(false); }
  };

  const sendReply = async (id) => {
    if (!replyBody.trim()) return;
    setBusy(true);
    try {
      await api.inquiries.send({ id, body: replyBody.trim() });
      setReplyBody(''); setReplyTo(null);
      await load();
    } catch { toast('送信に失敗しました'); }
    finally { setBusy(false); }
  };

  if (guestMode || !isAuthenticated) {
    return (
      <div style={{ maxWidth: 640 }}>
        <div className="pg-header"><div className="pg-title">お問い合わせ</div></div>
        <div className="card">
          <p style={{ fontSize: 13, color: 'var(--tx2)', lineHeight: 1.9 }}>
            返信のやり取りができるお問い合わせは、アカウント登録後にご利用いただけます。
            登録前のご質問は <a href="https://kurofukubo.com/contact.html" target="_blank" rel="noopener" style={{ color: 'var(--ac)' }}>公式サイトのお問い合わせ</a> からお送りください。
          </p>
        </div>
      </div>
    );
  }

  const note = { fontSize: 11.5, color: 'var(--tx3)', lineHeight: 1.8 };

  return (
    <div style={{ maxWidth: 720 }}>
      <div className="pg-header">
        <div className="pg-title">お問い合わせ</div>
        <div className="pg-sub">運営者に直接ご連絡いただけます。メールアドレスは不要です</div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">新しいお問い合わせ</div>
        <form onSubmit={send} style={{ display: 'grid', gap: 10 }}>
          <div className="fg"><label className="fl">件名（任意）</label>
            <input className="fc" type="text" maxLength={100} value={subject}
              placeholder="例：CSVの取込がうまくいきません" onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="fg"><label className="fl">内容</label>
            <textarea className="fc" rows={5} maxLength={2000} value={body}
              onChange={(e) => setBody(e.target.value)} />
          </div>
          <p style={note}>
            <strong style={{ color: 'var(--tx2)' }}>返信はこの画面に表示されます。</strong>
            メールでの通知は行いませんので、数日後にまたこのページをご確認ください。
            口座番号やパスワードなど、お問い合わせに不要な情報は書かないでください。
          </p>
          <div><button className="btn btn-p" type="submit" disabled={busy}>{busy ? '送信中…' : '送信する'}</button></div>
        </form>
      </div>

      <div className="card-title">これまでのお問い合わせ</div>
      {loading ? <p className="nd">読み込み中...</p> : items.length === 0 ? (
        <EmptyState icon="💬" title="まだお問い合わせはありません"
          desc="ご不明な点や、こう変えてほしいというご要望をお送りください。" />
      ) : items.map((it) => (
        <div key={it.id} className="card" style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{it.subject || '（件名なし）'}</div>
            <div style={{ fontSize: 11, color: 'var(--tx3)' }}>{fmt(it.createdAt)}</div>
          </div>
          {(it.messages || []).map((m, i) => (
            <div key={i} style={{
              background: m.from === 'staff' ? 'var(--acb)' : 'var(--bg3)',
              border: `1px solid ${m.from === 'staff' ? 'var(--ac)' : 'var(--bd)'}`,
              borderRadius: 8, padding: '10px 12px', marginBottom: 8,
            }}>
              <div style={{ fontSize: 11, color: m.from === 'staff' ? 'var(--ac)' : 'var(--tx3)', fontWeight: 700, marginBottom: 4 }}>
                {m.from === 'staff' ? '運営より' : 'あなた'}　<span style={{ fontWeight: 400, color: 'var(--tx3)' }}>{fmt(m.at)}</span>
              </div>
              <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>{m.body}</div>
            </div>
          ))}
          {it.status === 'closed' ? (
            <p style={note}>このお問い合わせは終了しています。続きがあれば新しくお送りください。</p>
          ) : replyTo === it.id ? (
            <div style={{ display: 'grid', gap: 8 }}>
              <textarea className="fc" rows={3} maxLength={2000} value={replyBody} autoFocus
                onChange={(e) => setReplyBody(e.target.value)} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-p btn-s" disabled={busy} onClick={() => sendReply(it.id)}>返信する</button>
                <button className="btn btn-g btn-s" onClick={() => { setReplyTo(null); setReplyBody(''); }}>やめる</button>
              </div>
            </div>
          ) : (
            <button className="btn btn-g btn-s" onClick={() => { setReplyTo(it.id); setReplyBody(''); }}>返信する</button>
          )}
        </div>
      ))}
    </div>
  );
}
