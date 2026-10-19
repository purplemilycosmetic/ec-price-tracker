'use client';
import { useState } from 'react';

const KEY = 'ec-admin-key';
function readKey() { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } }
function saveKey(k: string) { try { localStorage.setItem(KEY, k); } catch {} }

// 搜尋結果「加入追蹤」：選要加到哪個產品，或用這個商品建立新產品（可取名、設定爬蟲條件）
export default function AddButton(props: { url: string; title: string; price: number; image: string | null; query: string; products: { key: string; name: string }[] }) {
  const [state, setState] = useState<'idle' | 'pick' | 'busy' | 'done' | 'error'>('idle');
  const [line, setLine] = useState('');
  const [msg, setMsg] = useState('');

  async function add() {
    if (line === '__new') { window.location.href = `/new?name=${encodeURIComponent(props.query)}`; return; }
    let key = readKey();
    if (!key) {
      key = window.prompt('輸入管理密碼後即可加入追蹤（只需輸入一次）') || '';
      if (!key) return;
    }
    setState('busy');
    const r = await fetch('/api/listings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, urls: props.url, title: props.title, price: props.price, image: props.image, query: props.query, line: line || null }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) { saveKey(key); setState('done'); setMsg(props.products.find((p) => p.key === line)?.name || '自訂追蹤'); }
    else {
      if (r.status === 401) { try { localStorage.removeItem(KEY); } catch {} }
      setState('error'); setMsg(j.error || '加入失敗');
    }
  }

  if (state === 'done') return <span className="added">已加入「{msg}」</span>;
  if (state === 'idle') return <button className="btn-add" onClick={() => setState('pick')}>加入追蹤</button>;
  return (
    <span className="pick-to">
      <select value={line} onChange={(e) => setLine(e.target.value)} aria-label="加入到哪個產品">
        <option value="">自訂追蹤（未分類）</option>
        {props.products.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
        <option value="__new">＋ 建立新產品並取名…</option>
      </select>
      <button className="btn-add" onClick={add} disabled={state === 'busy'}>{state === 'busy' ? '加入中…' : '確定'}</button>
      {state === 'error' && <span className="err">{msg}</span>}
    </span>
  );
}
