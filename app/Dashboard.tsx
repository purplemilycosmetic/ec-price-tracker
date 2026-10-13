'use client';
import { Fragment, useMemo, useState } from 'react';
import { LINES } from '@/lib/classify';
import TrendChart from './TrendChart';

export type Listing = {
  id: number; brand: string | null; line: string | null; spec: string | null; platform: string;
  url: string; title: string | null; image_url: string | null;
};
export type Snap = {
  listing_id: number; captured_on: string; status: string; list_price: number | null; sale_price: number | null;
  final_price: number | null; promos: { text: string; period?: string }[]; in_stock: boolean | null; error: string | null;
};
export type PlatformEvent = {
  id: number; platform: string; kind: string; title: string | null; url: string; image_url: string | null;
  source: string | null; published_at: string | null; last_seen: string;
};

const PLATFORMS = [
  { key: 'momo', name: 'momo' },
  { key: 'official', name: '品牌官網' },
  { key: 'shopee', name: '蝦皮' },
  { key: 'coupang', name: '酷澎' },
];
const pname = (k: string) => PLATFORMS.find((p) => p.key === k)?.name ?? k;
const STATUS: Record<string, string> = { blocked: '平台阻擋', not_found: '已下架', error: '抓取失敗' };
const fmt = (n: number | null | undefined) => (n == null ? '—' : `$${n.toLocaleString()}`);
const specKey = (spec: string | null) => spec || '未標示規格';
function specSort(a: string, b: string) {
  const v = (s: string) => { const m = s.match(/([\d.]+)\D+(?:×(\d+))?/); return m ? +m[1] * (+(m[2] || 1)) : 1e9; };
  return v(a) - v(b);
}
// 全站通用、可以和商品折扣疊加的活動（全館滿額、刷卡回饋、折價券…）
const SITEWIDE = /全館|刷.*卡|信用卡|回饋|mo幣|蝦幣|折價券|優惠券|免運|LINE Pay|街口|全支付/;

function Thumb({ src, alt }: { src: string | null | undefined; alt: string }) {
  if (!src) return <div className="thumb empty" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="thumb" src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" />;
}

export default function Dashboard({ listings, snaps, events, today }: { listings: Listing[]; snaps: Snap[]; events: PlatformEvent[]; today: string }) {
  const [tab, setTab] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [trendSpec, setTrendSpec] = useState<string | null>(null);
  const line = LINES[tab];

  const byListing = useMemo(() => {
    const m = new Map<number, Snap[]>();
    for (const s of snaps) { if (!m.has(s.listing_id)) m.set(s.listing_id, []); m.get(s.listing_id)!.push(s); }
    return m;
  }, [snaps]);
  const days = useMemo(() => Array.from(new Set(snaps.map((s) => s.captured_on))).sort().slice(-30), [snaps]);
  const lastDay = days[days.length - 1];
  const latest = (l: Listing) => { const h = byListing.get(l.id); return h?.[h.length - 1]; };

  const lineListings = useMemo(() => listings.filter((l) => l.brand === line.brand && l.line === line.line), [listings, line]);
  const rows = useMemo(() => {
    const groups = new Map<string, Listing[]>();
    for (const l of lineListings) { const k = specKey(l.spec); if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(l); }
    return Array.from(groups.entries()).sort((a, b) => specSort(a[0], b[0]));
  }, [lineListings]);

  function cell(ls: Listing[], platform: string) {
    const mine = ls.filter((l) => l.platform === platform);
    if (!mine.length) return null;
    let best: { l: Listing; s: Snap; prev?: Snap } | null = null;
    let anyStatus: Snap | undefined;
    for (const l of mine) {
      const hist = byListing.get(l.id) || [];
      const s = hist[hist.length - 1];
      if (!s) continue;
      anyStatus = anyStatus || s;
      if (s.status !== 'ok' || s.final_price == null) continue;
      const prev = [...hist].reverse().find((h) => h.captured_on < s.captured_on && h.final_price != null);
      if (!best || s.final_price < best.s.final_price!) best = { l, s, prev };
    }
    return { best, anyStatus };
  }
  // 規格列的代表圖：優先用最便宜那一筆的圖
  function rowImage(ls: Listing[]) {
    const withImg = ls.filter((l) => l.image_url);
    withImg.sort((a, b) => (latest(a)?.final_price ?? 1e9) - (latest(b)?.final_price ?? 1e9));
    return withImg[0]?.image_url;
  }

  // ---- 趨勢圖：選定規格，每個平台每天的最低價 ----
  const specs = rows.map(([s]) => s);
  const curSpec = trendSpec && specs.includes(trendSpec) ? trendSpec
    : [...rows].sort((a, b) => new Set(b[1].map((l) => l.platform)).size - new Set(a[1].map((l) => l.platform)).size)[0]?.[0] ?? null;
  const trendSeries = PLATFORMS.map((p) => ({
    key: p.key, name: p.name,
    pts: days.map((day) => {
      const v = lineListings.filter((l) => specKey(l.spec) === curSpec && l.platform === p.key)
        .map((l) => (byListing.get(l.id) || []).find((s) => s.captured_on === day && s.status === 'ok')?.final_price)
        .filter((x): x is number => x != null);
      return v.length ? Math.min(...v) : null;
    }),
  }));

  // ---- 本品項活動：依平台分開，每則活動列出適用的規格 ----
  const linePromos = useMemo(() => {
    const out: Record<string, Map<string, { text: string; period?: string; specs: Set<string>; sitewide: boolean }>> = {};
    for (const l of lineListings) {
      const s = latest(l);
      if (!s || s.captured_on !== lastDay) continue;
      for (const p of s.promos || []) {
        out[l.platform] ||= new Map();
        const k = (p.period || '') + p.text;
        if (!out[l.platform].has(k)) out[l.platform].set(k, { ...p, specs: new Set(), sitewide: SITEWIDE.test(p.text) });
        out[l.platform].get(k)!.specs.add(specKey(l.spec));
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineListings, byListing, lastDay]);

  // ---- 可搭配的平台活動（不分品項）----
  const sitewide = useMemo(() => {
    const out: Record<string, Map<string, { text: string; period?: string }>> = {};
    for (const l of listings) {
      const s = latest(l);
      if (!s || s.captured_on !== lastDay) continue;
      for (const p of s.promos || []) if (SITEWIDE.test(p.text)) {
        out[l.platform] ||= new Map();
        out[l.platform].set((p.period || '') + p.text, p);
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listings, byListing, lastDay]);
  const banks = events.filter((e) => e.kind === 'bank');
  const news = events.filter((e) => e.kind === 'news').sort((a, b) => (b.published_at || '').localeCompare(a.published_at || ''));

  return (
    <div className="wrap">
      <header className="top">
        <div>
          <h1>保養品比價雷達</h1>
          <div className="muted">momo・品牌官網・蝦皮・酷澎 每日 09:00 自動更新</div>
        </div>
        <div className="muted">最近更新：{lastDay ?? '尚無資料'}{lastDay && lastDay !== today ? '（今日尚未更新）' : ''}　<a href="/admin">管理商品</a></div>
      </header>

      <div className="tabs">
        {LINES.map((l, i) => (
          <button key={i} className={`tab ${i === tab ? 'on' : ''}`} onClick={() => { setTab(i); setOpen(null); setTrendSpec(null); }}>
            {l.brand.split(' ')[0]} {l.line}
          </button>
        ))}
      </div>

      {/* 1. 比價表 */}
      <div className="card">
        <table>
          <thead>
            <tr>
              <th style={{ width: 190 }}>規格</th>
              {PLATFORMS.map((p) => <th key={p.key}><span className="dot" style={{ background: `var(--${p.key})` }} />{p.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {!rows.length && (
              <tr><td colSpan={5} className="muted">還沒有這個品項的商品。到「管理商品」貼上商品網址即可開始追蹤。</td></tr>
            )}
            {rows.map(([spec, ls]) => {
              const cells = PLATFORMS.map((p) => cell(ls, p.key));
              const lowest = Math.min(...cells.map((c) => c?.best?.s.final_price ?? Infinity));
              const isOpen = open === spec;
              return (
                <Fragment key={spec}>
                  <tr className="row" onClick={() => setOpen(isOpen ? null : spec)}>
                    <td>
                      <div className="spec-cell">
                        <Thumb src={rowImage(ls)} alt={spec} />
                        <div><b>{spec}</b><div className="sub">{ls.length} 個商品頁 {isOpen ? '▴' : '▾'}</div></div>
                      </div>
                    </td>
                    {cells.map((c, i) => {
                      if (!c) return <td key={i} className="status">未追蹤</td>;
                      if (!c.best) return <td key={i} className="status">{STATUS[c.anyStatus?.status ?? ''] ?? '等待抓取'}</td>;
                      const { s, prev, l } = c.best;
                      const d = prev ? s.final_price! - prev.final_price! : 0;
                      return (
                        <td key={i}>
                          <a className={`price ${s.final_price === lowest ? 'best' : ''}`} href={l.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                            {fmt(s.final_price)}
                          </a>
                          {d !== 0 && <span className={`delta ${d < 0 ? 'down' : 'up'}`}>{d < 0 ? '▼' : '▲'}{Math.abs(d)}</span>}
                          {s.list_price && s.list_price > s.final_price! && <div className="sub">原價 <span className="strike">{fmt(s.list_price)}</span></div>}
                          {s.in_stock === false && <div className="sub">缺貨</div>}
                        </td>
                      );
                    })}
                  </tr>
                  {isOpen && (
                    <tr className="detail">
                      <td colSpan={5}>
                        {ls.map((l) => {
                          const s = latest(l);
                          return (
                            <div className="listing" key={l.id}>
                              <Thumb src={l.image_url} alt={l.title || ''} />
                              <span><span className="dot" style={{ background: `var(--${l.platform})` }} />{pname(l.platform)}</span>
                              <a href={l.url} target="_blank" rel="noreferrer">{l.title || l.url}</a>
                              <span className="price" style={{ fontSize: 14 }}>{s?.status === 'ok' ? fmt(s.final_price) : STATUS[s?.status ?? ''] ?? '—'}</span>
                            </div>
                          );
                        })}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="muted" style={{ marginTop: 8 }}>紅字為該規格今日最低價。價格為頁面顯示的折後價，不含折價券、信用卡回饋。蝦皮（蝦皮商城）與酷澎價格經由 BigGo 比價網取得，可能比平台實際價格晚幾小時更新。點列可展開各商品頁。</div>

      {/* 2. 每日價格趨勢 */}
      <h2>每日價格趨勢</h2>
      {specs.length > 0 && (
        <div className="chips">
          {specs.map((s) => <button key={s} className={`chip-btn ${s === curSpec ? 'on' : ''}`} onClick={() => setTrendSpec(s)}>{s}</button>)}
        </div>
      )}
      <div className="card pad">
        {curSpec ? <TrendChart days={days} series={trendSeries} /> : <div className="muted">尚無資料</div>}
      </div>

      {/* 3. 本品項各平台活動 */}
      <h2>{line.brand.split(' ')[0]} {line.line}｜各平台活動</h2>
      <div className="promos">
        {PLATFORMS.map((p) => {
          const items = Array.from(linePromos[p.key]?.values() || []).sort((a, b) => Number(a.sitewide) - Number(b.sitewide));
          return (
            <div className="card pad" key={p.key}>
              <b><span className="dot" style={{ background: `var(--${p.key})` }} />{p.name}</b>
              {items.length ? (
                <ul>{items.slice(0, 12).map((it, i) => (
                  <li key={i}>
                    {it.period && <span className="muted">{it.period} </span>}{it.text}
                    {it.sitewide && <span className="tag">全站</span>}
                    <div className="sub">適用：{Array.from(it.specs).sort(specSort).join('、')}</div>
                  </li>
                ))}</ul>
              ) : <div className="muted" style={{ marginTop: 8 }}>今日無資料</div>}
            </div>
          );
        })}
      </div>

      {/* 4. 可搭配的平台活動 */}
      <h2>可搭配的平台活動</h2>
      <div className="muted" style={{ marginTop: -4, marginBottom: 10 }}>不限品項、可以和上面商品折扣一起用的全站活動：全館滿額、銀行／支付回饋，以及近期購物節新聞。</div>
      <div className="platform-events">
        {PLATFORMS.filter((p) => p.key !== 'official').map((p) => {
          const sw = Array.from(sitewide[p.key]?.values() || []);
          const bk = banks.filter((b) => b.platform === p.key);
          const nw = news.filter((n) => n.platform === p.key).slice(0, 6);
          return (
            <div className="card pad" key={p.key}>
              <b><span className="dot" style={{ background: `var(--${p.key})` }} />{p.name}</b>
              {sw.length > 0 && (<>
                <div className="ev-h">全館活動</div>
                <ul>{sw.map((s, i) => <li key={i}>{s.period && <span className="muted">{s.period} </span>}{s.text}</li>)}</ul>
              </>)}
              {bk.length > 0 && (<>
                <div className="ev-h">銀行／支付優惠</div>
                <div className="banners">
                  {bk.map((b) => (
                    <a key={b.id} href={b.url} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={b.image_url || ''} alt="銀行優惠活動" loading="lazy" referrerPolicy="no-referrer" />
                    </a>
                  ))}
                </div>
              </>)}
              <div className="ev-h">近期活動新聞</div>
              {nw.length ? (
                <ul className="news">{nw.map((n) => (
                  <li key={n.id}>
                    <a href={n.url} target="_blank" rel="noreferrer">{n.title}</a>
                    <div className="sub">{n.source}・{n.published_at?.slice(0, 10)}</div>
                  </li>
                ))}</ul>
              ) : <div className="muted">近三週沒有相關新聞</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
