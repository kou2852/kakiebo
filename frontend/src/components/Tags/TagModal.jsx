import { useState, useEffect } from 'react';
import { useData } from '../../contexts/DataContext';
import { TAG_COLORS } from '../../utils/format';
import { useToast } from '../Common/Toast';
import Modal from '../Common/Modal';

export default function TagModal({ open, onClose, editId }) {
  const { tags, saveTags } = useData();
  const toast = useToast();

  const [name, setName] = useState('');
  const [color, setColor] = useState(TAG_COLORS[0]);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return;
    if (editId) {
      const t = tags.find((x) => x.id === editId);
      if (t) { setName(t.name); setColor(t.color); setNote(t.note || ''); }
    } else {
      setName(''); setColor(TAG_COLORS[tags.length % TAG_COLORS.length]); setNote('');
    }
  }, [open, editId, tags]);

  const handleSave = async () => {
    if (!name.trim()) { toast('タグ名を入力してください'); return; }
    try {
      const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      let updated;
      if (editId) {
        updated = tags.map((t) => t.id === editId ? { ...t, name: name.trim(), color, note: note.trim() } : t);
      } else {
        updated = [...tags, { id: uid(), name: name.trim(), color, note: note.trim() }];
      }
      await saveTags(updated);
      toast('保存しました');
      onClose();
    } catch { toast('保存に失敗しました'); }
  };

  return (
    <Modal open={open} onClose={onClose} title={editId ? 'タグ編集' : 'タグ追加'}
      footer={<><button className="btn btn-g" onClick={onClose}>キャンセル</button><button className="btn btn-p" onClick={handleSave}>保存</button></>}>

      <div style={{ display: 'grid', gap: 10 }}>
        <div className="fg"><label className="fl">タグ名</label><input type="text" className="fc" maxLength={50} value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="fg"><label className="fl">色</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {TAG_COLORS.map((c) => (
              <div key={c} className={`tag-color-btn ${c === color ? 'sel' : ''}`}
                style={{ background: c }} onClick={() => setColor(c)} />
            ))}
          </div>
        </div>
        <div className="fg"><label className="fl">備考</label><input type="text" className="fc" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} /></div>
      </div>
    </Modal>
  );
}
