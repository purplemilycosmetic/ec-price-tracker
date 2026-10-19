'use client';
import { useEffect, useRef, useState } from 'react';

const KEY = 'ec-admin-key';
const readKey = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };

export default function CouponForm({ products, today }: { products: { key: string; name: string }[]; today: string }) {
  const [f, setF] = useState({ platform: 'shopee', kind: 'shop', product: '', title: '', min: '', type: 'amount', value: '', cap: '', start: today, end: '', note: '' });
  const [key, setKey] = useState('');
  const keyRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { const k = readKey(); if (k) setKey(k); }, []);
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));

  async function save() {
    const k = (keyRef.current?.value || key).trim();
    if (!k) { setMsg('請輸入管理密碼'); return; }
    if (!f.value) { setMsg('請填寫折抵金額或折數'); return; }
    setBusy(true); setMsg('儲存中…');
    const r = await fetch('/api/coupons', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: k, ...f }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.ok) { try { localStorage.setItem(KEY, k); } catch {} window.location.reload(); }
    else setMsg(j.error || '儲存失敗');
  }

  return (
    <div className="edit-panel coupon-form">
      <label>平台<select value={f.platform} onChange={(e) => set('platform', e.target.value)}>
        <option value="shopee">蝦皮</option><option value="momo">momo</option><option value="coupang">酷澎</option></select></label>
      <label>券的種類<select value={f.kind} onChange={(e) => set('kind', e.target.value)}>
        <option value="shop">賣場券（可和平台券疊加）</option><option value="platform">平台券／帳號券</option></select></label>
      <label>適用產品<select value={f.product} onChange={(e) => set('product', e.target.value)}>
        <option value="">這個平台全部商品</option>{products.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}</select></label>
      <label>券名稱（選填）<input value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="例如：OLAY 賣場券" /></label>
      <label>低消（滿多少可用）<input inputMode="numeric" value={f.min} onChange={(e) => set('min', e.target.value)} placeholder="例如：399；沒有低消填 0" /></label>
      <label>折扣方式<select value={f.type} onChange={(e) => set('type', e.target.value)}>
        <option value="amount">折抵金額（$）</option><option value="rate">打折（幾折）</option></select></label>
      <label>{f.type === 'amount' ? '折抵金額' : '幾折（例如 87 或 8.7）'}<input inputMode="decimal" value={f.value} onChange={(e) => set('value', e.target.value)} placeholder={f.type === 'amount' ? '例如：104' : '例如：87'} /></label>
      {f.type === 'rate' && <label>最高折抵（選填）<input inputMode="numeric" value={f.cap} onChange={(e) => set('cap', e.target.value)} placeholder="例如：200" /></label>}
      <label>開始日期<input type="date" value={f.start} onChange={(e) => set('start', e.target.value)} /></label>
      <label>到期日（留空＝刪除前一直有效）<input type="date" value={f.end} onChange={(e) => set('end', e.target.value)} /></label>
      <label>備註（選填）<input value={f.note} onChange={(e) => set('note', e.target.value)} placeholder="例如：限量、需先領券" /></label>
      <label>管理密碼<input ref={keyRef} type="password" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="current-password" /></label>
      <div className="edit-actions"><button className="primary" disabled={busy} onClick={save}>{busy ? '儲存中…' : '新增這張券'}</button>{msg && <span className="form-msg">{msg}</span>}</div>
    </div>
  );
}

export function DeleteCoupon({ id }: { id: string }) {
  async function del() {
    if (!window.confirm('刪除這張手動新增的券？')) return;
    let k = readKey(); if (!k) k = window.prompt('輸入管理密碼') || ''; if (!k) return;
    const r = await fetch('/api/coupons', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: k, action: 'delete', id }) });
    if (r.ok) window.location.reload(); else window.alert('刪除失敗，請確認管理密碼');
  }
  return <button className="btn-quiet" style={{ marginLeft: 10 }} onClick={del}>刪除</button>;
}
