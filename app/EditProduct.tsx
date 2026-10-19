'use client';
import { useState } from 'react';
import type { UserProduct } from '@/lib/custom';

// 自建產品的名稱與爬蟲條件編輯
export default function EditProduct({ p, onClose }: { p: UserProduct; onClose: () => void }) {
  const [name, setName] = useState(p.name);
  const [brand, setBrand] = useState(p.brand || '');
  const [queries, setQueries] = useState((p.queries || []).join(', '));
  const [must, setMust] = useState((p.must || []).join(' '));
  const [exclude, setExclude] = useState((p.exclude || []).join(' '));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function save() {
    let key = ''; try { key = localStorage.getItem('ec-admin-key') || ''; } catch {}
    if (!key) key = window.prompt('輸入管理密碼') || '';
    if (!key) return;
    setBusy(true);
    const r = await fetch('/api/products', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, action: 'edit', product: p.key, name, brand, queries, must, exclude }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.ok) { try { localStorage.setItem('ec-admin-key', key); } catch {} window.location.reload(); }
    else { if (r.status === 401) { try { localStorage.removeItem('ec-admin-key'); } catch {} } setMsg(j.error || '儲存失敗'); }
  }

  return (
    <div className="edit-panel">
      <label>產品名稱<input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} /></label>
      <label>品牌<input value={brand} onChange={(e) => setBrand(e.target.value)} maxLength={20} placeholder="選填" /></label>
      <label>搜尋關鍵字（多組用逗號分隔）<input value={queries} onChange={(e) => setQueries(e.target.value)} placeholder="留空＝用產品名稱搜尋" /></label>
      <label>標題必須包含（空白分隔）<input value={must} onChange={(e) => setMust(e.target.value)} placeholder="留空＝不自動加入新商品頁" /></label>
      <label>標題排除（空白分隔）<input value={exclude} onChange={(e) => setExclude(e.target.value)} placeholder="例如：試用 贈品" /></label>
      <p className="hist-sub">每天用搜尋關鍵字到 momo、蝦皮商城、酷澎找；標題包含所有「必須包含」的字、又沒有「排除」的字，就會自動加入這個產品。已加入的商品頁不受影響，不想要的可以在下方表格點開後移除。</p>
      <div className="edit-actions">
        <button className="primary" disabled={busy || !name.trim()} onClick={save}>{busy ? '儲存中…' : '儲存'}</button>
        <button className="btn-quiet" onClick={onClose}>取消</button>
        {msg && <span className="err">{msg}</span>}
      </div>
    </div>
  );
}
