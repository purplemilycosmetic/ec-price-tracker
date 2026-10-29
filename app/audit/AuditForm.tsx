'use client';
import { useEffect, useRef, useState } from 'react';

const KEY = 'ec-admin-key';

// 新增健檢；也用在報告頁的「重新健檢」
export default function AuditForm({ initial }: { initial?: { brand: string; url: string; category: string } }) {
  const [f, setF] = useState(initial ?? { brand: '', url: '', category: '' });
  const [key, setKey] = useState('');
  const keyRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { try { const k = localStorage.getItem(KEY); if (k) setKey(k); } catch {} }, []);

  async function go() {
    const k = (keyRef.current?.value || key).trim();
    if (!f.brand.trim() || !f.url.trim()) { setMsg('請填寫品牌名稱與官網'); return; }
    if (!f.category.trim()) { setMsg('請填寫主要品類（例如：精華液），AI 推薦潛力要用它來測'); return; }
    if (!k) { setMsg('請輸入管理密碼'); return; }
    setBusy(true); setMsg('建立中…');
    const r = await fetch('/api/audit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: k, ...f }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setBusy(false); setMsg(j.error || '建立失敗'); return; }
    try { localStorage.setItem(KEY, k); } catch {}
    window.location.href = `/audit/${j.id}`;
  }

  return (
    <div className="edit-panel audit-form">
      <label>品牌名稱（中英文都寫，例如：碧歐斯 Bio-essence）<input value={f.brand} onChange={(e) => setF({ ...f, brand: e.target.value })} /></label>
      <label>官網<input value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="www.bioessence.com.tw" /></label>
      <label>主要品類（必填，用來測「推薦」情境，例如：保濕噴霧、精華液）<input value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} /></label>
      <label>管理密碼<input ref={keyRef} type="password" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="current-password" /></label>
      <div className="edit-actions"><button className="primary" disabled={busy} onClick={go}>{busy ? '建立中…' : '開始健檢'}</button>{msg && <span className="form-msg">{msg}</span>}</div>
    </div>
  );
}
