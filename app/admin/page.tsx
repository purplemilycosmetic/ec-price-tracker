'use client';
import { useState } from 'react';
import { PRODUCTS, productLabel } from '@/lib/classify';

export default function Admin() {
  const [key, setKey] = useState('');
  const [urls, setUrls] = useState('');
  const [line, setLine] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true); setMsg('新增中並立即抓取一次…');
    const sel = PRODUCTS[+line];
    const r = await fetch('/api/listings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, urls, line: line ? sel.key : null }),
    });
    const j = await r.json();
    setBusy(false);
    setMsg(r.ok ? `已加入 ${j.added} 筆：成功 ${j.summary.ok}、被阻擋 ${j.summary.blocked}、失敗 ${j.summary.failed}${j.summary.deactivated ? `、非追蹤品項已略過 ${j.summary.deactivated}` : ''}` : j.error);
    if (r.ok) setUrls('');
  }

  return (
    <div className="wrap" style={{ maxWidth: 640 }}>
      <h1>管理追蹤商品</h1>
      <p className="muted">貼上 momo、品牌官網、蝦皮或酷澎的商品頁網址（一行一個），系統會自動判斷平台、品牌、品項和規格。<a href="/">回比價表</a></p>
      <label>管理密碼</label>
      <input type="password" value={key} onChange={(e) => setKey(e.target.value)} />
      <label>商品網址</label>
      <textarea rows={8} value={urls} onChange={(e) => setUrls(e.target.value)} placeholder="https://www.momoshop.com.tw/goods/GoodsDetail.jsp?i_code=7493417" />
      <label>品項（留空＝依標題自動判斷）</label>
      <select value={line} onChange={(e) => setLine(e.target.value)}>
        <option value="">自動判斷</option>
        {PRODUCTS.map((p, i) => <option key={p.key} value={i}>{productLabel(p)}</option>)}
      </select>
      <div style={{ marginTop: 16 }}><button className="primary" disabled={busy || !key || !urls} onClick={submit}>{busy ? '處理中…' : '加入並抓取'}</button></div>
      {msg && <p>{msg}</p>}
    </div>
  );
}
