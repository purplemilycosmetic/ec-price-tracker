'use client';
import { useState } from 'react';

export type Hit = { platform: string; title: string; url: string; price: number; image: string | null; spec: string | null; match: boolean };
const NAMES: Record<string, string> = { momo: 'momo', shopee: '蝦皮商城', coupang: '酷澎' };
const KEY = 'ec-admin-key';
const readKey = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };

export default function NewForm({ name, query, hits }: { name: string; query: string; hits: Hit[] }) {
  const [sel, setSel] = useState<Set<string>>(new Set(hits.filter((h) => h.match).map((h) => h.url)));
  const [urls, setUrls] = useState('');
  const [brand, setBrand] = useState('');
  const [key, setKey] = useState(readKey());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const toggle = (u: string) => setSel((s) => { const n = new Set(s); if (n.has(u)) n.delete(u); else n.add(u); return n; });

  async function submit() {
    setBusy(true); setMsg('建立中，並立即抓取一次（約需 10–30 秒）…');
    const items = hits.filter((h) => sel.has(h.url)).map((h) => ({ url: h.url, title: h.title, price: h.price, image: h.image }));
    const r = await fetch('/api/products', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, name, brand, query, items, urls }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.ok) {
      try { localStorage.setItem(KEY, key); localStorage.setItem('ec-tab', j.product); } catch {}
      window.location.href = '/';
    } else setMsg(j.error || '建立失敗');
  }

  return (
    <div>
      {(['momo', 'shopee', 'coupang'] as const).map((p) => {
        const list = hits.filter((h) => h.platform === p).slice(0, 24);
        return (
          <section key={p} className="result-group">
            <h2 className="group-title"><span className="swatch" style={{ background: `var(--${p})` }} />{NAMES[p]}<span className="count">{list.length}</span></h2>
            {list.length ? (
              <ul className="results">
                {list.map((h) => (
                  <li key={h.url} className="result">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {h.image ? <img src={h.image} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="noimg" />}
                    <label className="result-body pick">
                      <input type="checkbox" checked={sel.has(h.url)} onChange={() => toggle(h.url)} />
                      <span>
                        <span className="result-title">{h.title}</span>
                        <span className="result-meta">{h.spec && <span>{h.spec}</span>}{h.match && <span className="tracked">符合產品名稱</span>}</span>
                      </span>
                    </label>
                    <div className="result-side"><span className="num price-lg">${h.price.toLocaleString()}</span></div>
                  </li>
                ))}
              </ul>
            ) : <p className="none">沒有搜尋到，可換個關鍵字再搜，或在下方貼上網址。</p>}
          </section>
        );
      })}

      <section className="block new-box">
        <div className="block-head"><h2>確認並建立</h2><p>已勾選 {sel.size} 個商品。搜尋沒找到的商品可貼網址（一行一個）。</p></div>
        <label>其他商品網址（選填）</label>
        <textarea rows={3} value={urls} onChange={(e) => setUrls(e.target.value)} placeholder="https://www.momoshop.com.tw/goods/GoodsDetail.jsp?i_code=…" />
        <label>品牌（選填）</label>
        <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="例如：理膚寶水" />
        <label>管理密碼</label>
        <input type="password" value={key} onChange={(e) => setKey(e.target.value)} />
        <div style={{ marginTop: 16 }}>
          <button className="primary" disabled={busy || !key || (!sel.size && !urls.trim())} onClick={submit}>{busy ? '處理中…' : `建立「${name}」並開始追蹤`}</button>
        </div>
        {msg && <p>{msg}</p>}
      </section>
    </div>
  );
}
