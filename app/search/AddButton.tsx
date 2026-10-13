'use client';
import { useState } from 'react';

const KEY = 'ec-admin-key';
function readKey() { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } }
function saveKey(k: string) { try { localStorage.setItem(KEY, k); } catch {} }

// 搜尋結果「加入追蹤」：需要管理密碼，輸入一次後記在這台裝置
export default function AddButton(props: { url: string; title: string; price: number; image: string | null; query: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [msg, setMsg] = useState('');

  async function add() {
    let key = readKey();
    if (!key) {
      key = window.prompt('輸入管理密碼後即可加入追蹤（只需輸入一次）') || '';
      if (!key) return;
    }
    setState('busy');
    const r = await fetch('/api/listings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, urls: props.url, title: props.title, price: props.price, image: props.image, query: props.query }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) { saveKey(key); setState('done'); }
    else {
      if (r.status === 401) { try { localStorage.removeItem(KEY); } catch {} }
      setState('error'); setMsg(j.error || '加入失敗');
    }
  }

  if (state === 'done') return <span className="added">已加入追蹤</span>;
  return (
    <>
      <button className="btn-add" onClick={add} disabled={state === 'busy'}>{state === 'busy' ? '加入中…' : '加入追蹤'}</button>
      {state === 'error' && <span className="err">{msg}</span>}
    </>
  );
}
