'use client';
import { Fragment, useMemo, useState } from 'react';
import { LINES } from '@/lib/classify';

export type Listing = { id: number; brand: string | null; line: string | null; spec: string | null; platform: string; url: string; title: string | null };
export type Snap = {
  listing_id: number; captured_on: string; status: string; list_price: number | null; sale_price: number | null;
  final_price: number | null; promos: { text: string; period?: string }[]; in_stock: boolean | null; error: string | null;
};

const PLATFORMS = [
  { key: 'momo', name: 'momo' },
  { key: 'official', name: '品牌官網' },
  { key: 'shopee', name: '蝦皮' },
  { key: 'coupang', name: '酷澎' },
];
const STATUS: Record<string, string> = { blocked: '平台阻擋', not_found: '已下架', error: '抓取失敗' };
const fmt = (n: number | null | undefined) => (n == null ? '—' : `$${n.toLocaleString()}`);

function specKey(spec: string | null) {
  return spec || '未標示規格';
}
// 依容量與入數排序
function specSort(a: string, b: string) {
  const v = (s: string) => { const m = s.match(/([\d.]+)\D+(?:×(\d+))?/); return m ? +m[1] * (+(m[2] || 1)) : 1e9; };
  return v(a) - v(b);
}

function Spark({ series }: { series: { key: string; pts: (number | null)[] }[] }) {
  const all = series.flatMap((s) => s.pts).filter((x): x is number => x != null);
  if (all.length < 2) return <div className="muted">累積兩天以上資料後會顯示價格走勢</div>;
  const min = Math.min(...all), max = Math.max(...all), W = 520, H = 120, P = 8;
  const n = Math.max(...series.map((s) => s.pts.length));
  const x = (i: number) => P + (i * (W - 2 * P)) / Math.max(1, n - 1);
  const y = (v: number) => H - P - ((v - min) / Math.max(1, max - min)) * (H - 2 * P);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W, height: H }} role="img" aria-label="價格走勢">
      {series.map((s) => {
        let d = ''; s.pts.forEach((v, i) => { if (v != null) d += `${d && s.pts[i - 1] != null ? 'L' : 'M'}${x(i)},${y(v)}`; });
        return <path key={s.key} d={d} fill="none" stroke={`var(--${s.key})`} strokeWidth={2} />;
      })}
      <text x={W - P} y={12} textAnchor="end" fontSize="11" fill="var(--muted)">{fmt(max)}</text>
      <text x={W - P} y={H - 2} textAnchor="end" fontSize="11" fill="var(--muted)">{fmt(min)}</text>
    </svg>
  );
}

export default function Dashboard({ listings, snaps, today }: { listings: Listing[]; snaps: Snap[]; today: string }) {
  const [tab, setTab] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const line = LINES[tab];

  const byListing = useMemo(() => {
    const m = new Map<number, Snap[]>();
    for (const s of snaps) { if (!m.has(s.listing_id)) m.set(s.listing_id, []); m.get(s.listing_id)!.push(s); }
    return m;
  }, [snaps]);
  const days = useMemo(() => Array.from(new Set(snaps.map((s) => s.captured_on))).sort().slice(-30), [snaps]);
  const lastDay = days[days.length - 1];

  const rows = useMemo(() => {
    const ls = listings.filter((l) => l.brand === line.brand && l.line === line.line);
    const groups = new Map<string, Listing[]>();
    for (const l of ls) { const k = specKey(l.spec); if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(l); }
    return Array.from(groups.entries()).sort((a, b) => specSort(a[0], b[0]));
  }, [listings, line]);

  // 各平台：取該規格最低的「今日」價格與前一天比較
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
    return { best, count: mine.length, anyStatus };
  }

  const promoBoard = useMemo(() => {
    const out: Record<string, Map<string, { text: string; period?: string; titles: Set<string> }>> = {};
    for (const l of listings) {
      const hist = byListing.get(l.id) || [];
      const s = hist[hist.length - 1];
      if (!s || s.captured_on !== lastDay) continue;
      for (const p of s.promos || []) {
        out[l.platform] ||= new Map();
        const k = (p.period || '') + p.text;
        if (!out[l.platform].has(k)) out[l.platform].set(k, { ...p, titles: new Set() });
        out[l.platform].get(k)!.titles.add(`${l.brand ?? ''} ${l.spec ?? ''}`.trim());
      }
    }
    return out;
  }, [listings, byListing, lastDay]);

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
          <button key={i} className={`tab ${i === tab ? 'on' : ''}`} onClick={() => { setTab(i); setOpen(null); }}>
            {l.brand.split(' ')[0]} {l.line}
          </button>
        ))}
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th style={{ width: 130 }}>規格</th>
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
                    <td><b>{spec}</b><div className="sub">{ls.length} 個商品頁 {isOpen ? '▴' : '▾'}</div></td>
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
                          <div>{(s.promos || []).slice(0, 2).map((p, j) => <span key={j} className="chip">{p.text}</span>)}</div>
                        </td>
                      );
                    })}
                  </tr>
                  {isOpen && (
                    <tr className="detail">
                      <td colSpan={5}>
                        <Spark series={PLATFORMS.map((p) => ({
                          key: p.key,
                          pts: days.map((day) => {
                            const v = ls.filter((l) => l.platform === p.key)
                              .map((l) => (byListing.get(l.id) || []).find((s) => s.captured_on === day)?.final_price)
                              .filter((x): x is number => x != null);
                            return v.length ? Math.min(...v) : null;
                          }),
                        }))} />
                        <div style={{ marginTop: 10 }}>
                          {ls.map((l) => {
                            const s = (byListing.get(l.id) || []).at(-1);
                            return (
                              <div className="listing" key={l.id}>
                                <span><span className="dot" style={{ background: `var(--${l.platform})` }} />{PLATFORMS.find((p) => p.key === l.platform)?.name}</span>
                                <a href={l.url} target="_blank" rel="noreferrer">{l.title || l.url}</a>
                                <span className="price" style={{ fontSize: 14 }}>{s?.status === 'ok' ? fmt(s.final_price) : STATUS[s?.status ?? ''] ?? '—'}</span>
                              </div>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="muted" style={{ marginTop: 8 }}>紅字為該規格今日最低價。價格為頁面顯示的折後價，不含折價券、信用卡回饋。蝦皮（蝦皮商城）與酷澎價格經由 BigGo 比價網取得，可能比平台實際價格晚幾小時更新。點列可展開走勢與各商品頁。</div>

      <h2>各平台今日活動</h2>
      <div className="promos">
        {PLATFORMS.map((p) => {
          const items = Array.from(promoBoard[p.key]?.values() || []);
          return (
            <div className="card" key={p.key}>
              <b><span className="dot" style={{ background: `var(--${p.key})` }} />{p.name}</b>
              {items.length ? (
                <ul>{items.slice(0, 12).map((it, i) => (
                  <li key={i}>{it.period && <span className="muted">{it.period} </span>}{it.text}
                    <span className="muted">（{Array.from(it.titles).slice(0, 3).join('、')}{it.titles.size > 3 ? '…' : ''}）</span></li>
                ))}</ul>
              ) : <div className="muted" style={{ marginTop: 8 }}>今日無資料</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
