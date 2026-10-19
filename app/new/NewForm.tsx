'use client';
import { useEffect, useRef, useState } from 'react';

export type Hit = { platform: string; title: string; url: string; price: number; image: string | null; spec: string | null; match: boolean };
const NAMES: Record<string, string> = { momo: 'momo', shopee: '蝦皮商城', coupang: '酷澎' };
const KEY = 'ec-admin-key';
const readKey = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };

export default function NewForm({ name, query, hits }: { name: string; query: string; hits: Hit[] }) {
  const [sel, setSel] = useState<Set<string>>(new Set(hits.filter((h) => h.match).map((h) => h.url)));
  const [urls, setUrls] = useState('');
  const [brand, setBrand] = useState('');
  const [queries, setQueries] = useState(query);
  const [must, setMust] = useState(name);
  const [exclude, setExclude] = useState('');
  const [key, setKey] = useState('');
  const keyRef = useRef<HTMLInputElement>(null);
  // 記住的密碼在載入後才讀（避免伺服器與瀏覽器畫面不一致）
  useEffect(() => { const k = readKey(); if (k) setKey(k); }, []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const toggle = (u: string) => setSel((s) => { const n = new Set(s); if (n.has(u)) n.delete(u); else n.add(u); return n; });

  async function submit() {
    // 瀏覽器自動填入的密碼不一定會通知網頁，直接讀欄位裡的值
    const k = (keyRef.current?.value || key).trim();
    if (!k) { setMsg('請輸入管理密碼'); keyRef.current?.focus(); return; }
    if (!sel.size && !urls.trim() && !must.trim()) { setMsg('請至少勾選一個商品、貼上網址，或填寫「標題必須包含」'); return; }
    setBusy(true); setMsg('建立中，並立即抓取一次（約需 10–40 秒），請稍候…');
    const items = hits.filter((h) => sel.has(h.url)).map((h) => ({ url: h.url, title: h.title, price: h.price, image: h.image }));
    const r = await fetch('/api/products', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: k, name, brand, queries, must, exclude, items, urls }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.ok) {
      try { localStorage.setItem(KEY, k); localStorage.setItem('ec-tab', j.product); } catch {}
      window.location.href = '/';
    } else setMsg(j.error || (r.status >= 500 ? '伺服器處理逾時，產品可能已建立，請回首頁確認' : '建立失敗'));
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
        <h3 className="sub-h">爬蟲條件</h3>
        <p className="hist-sub">每天會用「搜尋關鍵字」到 momo、蝦皮商城、酷澎搜尋；標題同時包含「必須包含」的每個字、又沒有「排除」的字，就自動加入這個產品。條件寫得越準，抓到的越正確。</p>
        <label>搜尋關鍵字（多組用逗號分隔）</label>
        <input value={queries} onChange={(e) => setQueries(e.target.value)} placeholder="例如：理膚寶水 B5 修復霜, La Roche-Posay Cicaplast" />
        <label>標題必須包含（用空白分隔；留空＝不自動加入，只追蹤上面勾選的）</label>
        <input value={must} onChange={(e) => setMust(e.target.value)} placeholder="例如：理膚寶水 B5 修復霜" />
        <label>標題排除（用空白分隔）</label>
        <input value={exclude} onChange={(e) => setExclude(e.target.value)} placeholder="例如：試用 贈品 旅行組" />
        <label>管理密碼</label>
        <input ref={keyRef} type="password" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="current-password" />
        <div style={{ marginTop: 16 }}>
          <button className="primary" disabled={busy} onClick={submit}>{busy ? '處理中…' : `建立「${name}」並開始追蹤`}</button>
        </div>
        {msg && <p className="form-msg" role="status">{msg}</p>}
      </section>
    </div>
  );
}
