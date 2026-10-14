'use client';
import { useState } from 'react';

// 已停止追蹤的產品：按「恢復追蹤」重新開始每天抓取
export default function Restore({ items }: { items: { key: string; name: string }[] }) {
  const [busy, setBusy] = useState('');
  async function restore(product: string) {
    let key = ''; try { key = localStorage.getItem('ec-admin-key') || ''; } catch {}
    if (!key) key = window.prompt('輸入管理密碼') || '';
    if (!key) return;
    setBusy(product);
    const r = await fetch('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, action: 'restore', product }) });
    setBusy('');
    if (r.ok) { try { localStorage.setItem('ec-admin-key', key); localStorage.setItem('ec-tab', product); } catch {} window.location.href = '/'; }
    else window.alert('操作失敗，請確認管理密碼');
  }
  if (!items.length) return null;
  return (
    <section className="block new-box">
      <div className="block-head"><h2>已停止追蹤的產品</h2><p>歷史資料都還在；恢復後從下一次更新開始繼續抓。</p></div>
      <ul className="restore">
        {items.map((i) => (
          <li key={i.key}><span>{i.name}</span>
            <button className="btn-add" disabled={busy === i.key} onClick={() => restore(i.key)}>{busy === i.key ? '恢復中…' : '恢復追蹤'}</button></li>
        ))}
      </ul>
    </section>
  );
}
