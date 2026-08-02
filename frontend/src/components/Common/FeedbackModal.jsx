import { useState } from 'react';
import * as api from '../../api/client';
import { track } from '../../utils/track';
import Modal from './Modal';
import { useToast } from './Toast';

export default function FeedbackModal({ open, onClose }) {
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  const submit = async () => {
    const trimmed = body.trim();
    if (!trimmed) {
      toast('ご意見を入力してください');
      return;
    }
    if (Array.from(trimmed).length < 2) {
      toast('ご意見は2文字以上で入力してください');
      return;
    }
    setSubmitting(true);
    try {
      await api.feedback.send(trimmed);
      track('feedback_sent');
      toast('ご意見ありがとうございます');
      setBody('');
      onClose();
    } catch {
      toast('送信に失敗しました。時間をおいてお試しください');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="使ってみていかがですか？"
      footer={(
        <>
          <button className="btn btn-g" type="button" onClick={onClose} disabled={submitting}>あとで</button>
          <button className="btn btn-p" type="button" onClick={submit} disabled={submitting}>送信する</button>
        </>
      )}
    >
      <p style={{ color: 'var(--tx2)', fontSize: 13, lineHeight: 1.7, margin: '0 0 12px' }}>
        「こんな機能が欲しい」「ここが使いにくい」など、気づいたことを自由にお聞かせください。
      </p>
      <textarea
        className="fc"
        rows={5}
        maxLength={1000}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="ご意見・ご要望"
        aria-label="ご意見・ご要望"
      />
      <p style={{ color: 'var(--tx3)', fontSize: 11, lineHeight: 1.7, margin: '8px 0 0' }}>
        匿名で送信されます（アカウントとは紐づけず、IPアドレスも記録しません）。返信はできないため、お名前・連絡先は入力しないでください。
      </p>
    </Modal>
  );
}
