'use client';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { PRODUCTS, CUSTOM } from '@/lib/classify';
import TrendChart from './TrendChart';
import { SITEWIDE } from '@/lib/promo';

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
export type OfficialProduct = {
  key: string; official_name: string | null; official_url: string | null; image_url: string | null;
  channels: { name: string; url: string }[];
};

// 比價表與趨勢圖的平台（品牌官網不販售，資訊放在產品卡）
const PLATFORMS = [
  { key: 'momo', name: 'momo' },
  { key: 'shopee', name: '蝦皮商城' },
  { key: 'coupang', name: '酷澎' },
];
const pname = (k: string) => PLATFORMS.find((p) => p.key === k)?.name ?? k;
const STATUS: Record<string, string> = { blocked: '平台阻擋', not_found: '已下架', error: '暫時抓不到' };
const fmt = (n: number | null | undefined) => (n == null ? '—' : `$${n.toLocaleString()}`);
const specKey = (spec: string | null) => spec || '未標示規格';
function specSort(a: string, b: string) {
  const v = (s: string) => { const m = s.match(/([\d.]+)\D+(?:×(\d+))?/); return m ? +m[1] * (+(m[2] || 1)) : 1e9; };
  return v(a) - v(b);
}

function Img({ src, alt, className }: { src: string | null | undefined; alt: string; className: string }) {
  if (!src) return <span className={`${className} img-empty`} aria-hidden />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={className} src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" />;
}

export default function Dashboard({ listings, snaps, events, officials, today }: {
  listings: Listing[]; snaps: Snap[]; events: PlatformEvent[]; officials: OfficialProduct[]; today: string;
}) {
  const hasCustom = listings.some((l) => l.line === CUSTOM);
  const tabs = [...PRODUCTS.map((p) => ({ key: p.key, brand: p.brand.split(' ')[0], name: p.name, short: p.short })),
    ...(hasCustom ? [{ key: CUSTOM, brand: '自訂', name: '自行搜尋加入的商品', short: '自訂追蹤' }] : [])];
  const [tabKey, setTabKey] = useState(tabs[0].key);
  // 記住上次看的產品（只是這台裝置的偏好，讀不到就用第一個）
  useEffect(() => { try { const k = localStorage.getItem('ec-tab'); if (k && tabs.some((t) => t.key === k)) setTabKey(k); } catch {} }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { try { localStorage.setItem('ec-tab', tabKey); } catch {} }, [tabKey]);
  const [open, setOpen] = useState<string | null>(null);
  const [trendSpec, setTrendSpec] = useState<string | null>(null);
  const tab = tabs.find((t) => t.key === tabKey) ?? tabs[0];
  const official = officials.find((o) => o.key === tab.key);

  const byListing = useMemo(() => {
    const m = new Map<number, Snap[]>();
    for (const s of snaps) { if (!m.has(s.listing_id)) m.set(s.listing_id, []); m.get(s.listing_id)!.push(s); }
    return m;
  }, [snaps]);
  const days = useMemo(() => Array.from(new Set(snaps.map((s) => s.captured_on))).sort().slice(-30), [snaps]);
  const lastDay = days[days.length - 1];
  const latest = (l: Listing) => { const h = byListing.get(l.id); return h?.[h.length - 1]; };
  const okToday = (l: Listing) => { const s = latest(l); return s && s.captured_on === lastDay && s.status === 'ok' && s.final_price != null ? s : null; };

  const tabListings = useMemo(() => listings.filter((l) => l.line === tab.key && PLATFORMS.some((p) => p.key === l.platform)), [listings, tab.key]);
  const rows = useMemo(() => {
    const groups = new Map<string, Listing[]>();
    for (const l of tabListings) { const k = tab.key === CUSTOM ? (l.title || l.url) : specKey(l.spec); if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(l); }
    return Array.from(groups.entries()).sort((a, b) => specSort(a[0], b[0]));
  }, [tabListings, tab.key]);

  function best(ls: Listing[], platform: string) {
    let b: { l: Listing; s: Snap; prev?: Snap } | null = null;
    for (const l of ls.filter((x) => x.platform === platform)) {
      const s = okToday(l);
      if (!s) continue;
      const hist = byListing.get(l.id) || [];
      const prev = [...hist].reverse().find((h) => h.captured_on < s.captured_on && h.final_price != null);
      if (!b || s.final_price! < b.s.final_price!) b = { l, s, prev };
    }
    return b;
  }

  // 主力規格：最多平台都有賣的規格，用在產品卡的價格階梯與預設趨勢圖
  const heroSpec = useMemo(() => [...rows].sort((a, b) =>
    new Set(b[1].filter((l) => okToday(l)).map((l) => l.platform)).size - new Set(a[1].filter((l) => okToday(l)).map((l) => l.platform)).size
    || b[1].length - a[1].length)[0]?.[0] ?? null, [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const heroRow = rows.find(([s]) => s === heroSpec)?.[1] ?? [];
  const ladder = PLATFORMS.map((p) => ({ p, b: best(heroRow, p.key) })).filter((x) => x.b).sort((a, b) => a.b!.s.final_price! - b.b!.s.final_price!);
  const ladderMax = Math.max(...ladder.map((x) => x.b!.s.final_price!), 1);
  const heroImage = official?.image_url || [...tabListings].sort((a, b) => (a.platform === 'momo' ? -1 : 1) - (b.platform === 'momo' ? -1 : 1)).find((l) => l.image_url)?.image_url;

  const specs = rows.map(([s]) => s);
  const curSpec = trendSpec && specs.includes(trendSpec) ? trendSpec : heroSpec;
  const trendSeries = PLATFORMS.map((p) => ({
    key: p.key, name: p.name,
    pts: days.map((day) => {
      const v = (rows.find(([s]) => s === curSpec)?.[1] ?? []).filter((l) => l.platform === p.key)
        .map((l) => (byListing.get(l.id) || []).find((s) => s.captured_on === day && s.status === 'ok')?.final_price)
        .filter((x): x is number => x != null);
      return v.length ? Math.min(...v) : null;
    }),
  }));

  // 本產品活動：依平台分開，每則活動列出適用規格；全站活動移到下方「可搭配」
  const productPromos = useMemo(() => {
    const out: Record<string, Map<string, { text: string; period?: string; specs: Set<string> }>> = {};
    for (const l of tabListings) {
      const s = okToday(l);
      if (!s) continue;
      for (const p of s.promos || []) {
        if (SITEWIDE.test(p.text)) continue;
        out[l.platform] ||= new Map();
        const k = (p.period || '') + p.text;
        if (!out[l.platform].has(k)) out[l.platform].set(k, { ...p, specs: new Set() });
        out[l.platform].get(k)!.specs.add(specKey(l.spec));
      }
    }
    return out;
  }, [tabListings, byListing, lastDay]); // eslint-disable-line react-hooks/exhaustive-deps

  const sitewide = useMemo(() => {
    const out: Record<string, Map<string, { text: string; period?: string }>> = {};
    for (const l of listings) {
      const s = okToday(l);
      if (!s) continue;
      for (const p of s.promos || []) if (SITEWIDE.test(p.text)) {
        out[l.platform] ||= new Map();
        out[l.platform].set((p.period || '') + p.text.replace(/再/, ''), p);
      }
    }
    // 「全館滿1500折180」和「滿1,500元折180元」是同一件事，只留一則
    for (const m of Object.values(out)) {
      const seen = new Set<string>();
      Array.from(m.entries()).forEach(([k, v]) => { const n = v.text.replace(/[^\d]/g, ''); if (seen.has(n)) m.delete(k); else seen.add(n); });
    }
    return out;
  }, [listings, byListing, lastDay]); // eslint-disable-line react-hooks/exhaustive-deps
  const banks = events.filter((e) => e.kind === 'bank');
  const news = events.filter((e) => e.kind === 'news').sort((a, b) => (b.published_at || '').localeCompare(a.published_at || ''));
  const tileImage = (key: string) => officials.find((o) => o.key === key)?.image_url
    || listings.find((l) => l.line === key && l.platform === 'momo' && l.image_url)?.image_url
    || listings.find((l) => l.line === key && l.image_url)?.image_url;

  return (
    <main className="page">
      {/* 產品切換 */}
      <nav className="switcher" aria-label="追蹤產品">
        {tabs.map((t) => (
          <button key={t.key} className={`tile ${t.key === tab.key ? 'on' : ''}`} aria-pressed={t.key === tab.key}
            onClick={() => { setTabKey(t.key); setOpen(null); setTrendSpec(null); }}>
            <Img src={tileImage(t.key)} alt="" className="tile-img" />
            <span className="tile-brand">{t.brand}</span>
            <span className="tile-name">{t.short}</span>
          </button>
        ))}
      </nav>

      {/* 產品卡 */}
      <section className="hero">
        <Img src={heroImage} alt={tab.name} className="hero-img" />
        <div className="hero-body">
          <div className="hero-brand">{tab.brand === '自訂' ? '自訂追蹤' : PRODUCTS.find((p) => p.key === tab.key)?.brand}</div>
          <h1 className="display">{official?.official_name || tab.name}</h1>
          <div className="hero-links">
            {official?.official_url && <a href={official.official_url} target="_blank" rel="noreferrer">品牌官網</a>}
            {official?.channels?.length ? (
              <span className="channels">官方授權通路：{official.channels.map((c, i) => (
                <Fragment key={c.name}>{i > 0 && '、'}<a href={c.url} target="_blank" rel="noreferrer">{c.name}</a></Fragment>
              ))}</span>
            ) : null}
            {official?.official_url && <span className="note">官網不直接販售，無官網售價</span>}
          </div>
          <div className="hero-stats">
            追蹤 {tabListings.length} 個商品頁、{rows.length} 種規格，資料日期 {lastDay ?? '—'}{lastDay && lastDay !== today ? '（今日 09:00 更新尚未完成）' : ''}
          </div>
        </div>
        {ladder.length > 0 && tab.key !== CUSTOM && (
          <div className="ladder" aria-label={`${heroSpec} 今日各平台最低價`}>
            <div className="ladder-title">{heroSpec}　今日最低價</div>
            {ladder.map(({ p, b }, i) => (
              <a key={p.key} className="rung" href={b!.l.url} target="_blank" rel="noreferrer">
                <span className="rung-name"><span className="swatch" style={{ background: `var(--${p.key})` }} />{p.name}</span>
                <span className="rung-bar"><span style={{ width: `${(b!.s.final_price! / ladderMax) * 100}%`, background: `var(--${p.key})` }} /></span>
                <span className="num rung-price">{fmt(b!.s.final_price)}</span>
                {i === 0 && ladder.length > 1 && <span className="lowest">最低</span>}
              </a>
            ))}
            {ladder.length > 1 && (
              <div className="ladder-gap">最高與最低差 {fmt(ladder[ladder.length - 1].b!.s.final_price! - ladder[0].b!.s.final_price!)}</div>
            )}
          </div>
        )}
      </section>

      {/* 規格比價 */}
      <section className="block">
        <div className="block-head">
          <h2>各規格價格</h2>
          <p>每格是該平台這個規格今天的最低折後價，不含折價券與刷卡回饋。點一列可看所有商品頁。</p>
        </div>
        <div className="table-wrap">
          <table className="grid-table">
            <thead>
              <tr>
                <th scope="col">{tab.key === CUSTOM ? '商品' : '規格'}</th>
                {PLATFORMS.map((p) => <th key={p.key} scope="col"><span className="swatch" style={{ background: `var(--${p.key})` }} />{p.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {!rows.length && (
                <tr><td colSpan={4} className="empty-cell">這個產品還沒有資料。用上方搜尋找到商品後按「加入追蹤」，或到「管理」貼上商品網址。</td></tr>
              )}
              {rows.map(([spec, ls]) => {
                const cells = PLATFORMS.map((p) => ({ p, b: best(ls, p.key), has: ls.some((l) => l.platform === p.key) }));
                const lowest = Math.min(...cells.map((c) => c.b?.s.final_price ?? Infinity));
                const isOpen = open === spec;
                const img = ls.find((l) => l.platform === 'momo' && l.image_url)?.image_url || ls.find((l) => l.image_url)?.image_url;
                return (
                  <Fragment key={spec}>
                    <tr className={`row ${isOpen ? 'is-open' : ''}`} onClick={() => setOpen(isOpen ? null : spec)}
                      tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(isOpen ? null : spec); } }}
                      aria-expanded={isOpen}>
                      <th scope="row">
                        <span className="spec">
                          <Img src={img} alt="" className="thumb" />
                          <span><span className="spec-name">{spec}</span><span className="spec-sub">{ls.length} 個商品頁</span></span>
                        </span>
                      </th>
                      {cells.map(({ p, b, has }) => {
                        if (!has) return <td key={p.key} className="na" data-label={p.name}>未販售</td>;
                        if (!b) {
                          const st = ls.filter((l) => l.platform === p.key).map(latest).find(Boolean)?.status;
                          return <td key={p.key} className="na" data-label={p.name}>{STATUS[st ?? ''] ?? '今日無資料'}</td>;
                        }
                        const d = b.prev ? b.s.final_price! - b.prev.final_price! : 0;
                        const isLow = b.s.final_price === lowest && cells.filter((c) => c.b).length > 1;
                        return (
                          <td key={p.key} data-label={p.name}>
                            <a className={`num price ${isLow ? 'is-low' : ''}`} href={b.l.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                              {fmt(b.s.final_price)}
                            </a>
                            {isLow && <span className="lowest">最低</span>}
                            {d !== 0 && <span className={`num delta ${d < 0 ? 'down' : 'up'}`}>{d < 0 ? '↓' : '↑'}{Math.abs(d)}</span>}
                            {b.s.list_price != null && b.s.list_price > b.s.final_price! && <span className="num was">原價 {fmt(b.s.list_price)}</span>}
                          </td>
                        );
                      })}
                    </tr>
                    {isOpen && (
                      <tr className="detail">
                        <td colSpan={4}>
                          <ul className="pages">
                            {[...ls].sort((a, b) => (okToday(a)?.final_price ?? 1e9) - (okToday(b)?.final_price ?? 1e9)).map((l) => {
                              const s = okToday(l);
                              return (
                                <li key={l.id}>
                                  <Img src={l.image_url} alt="" className="thumb" />
                                  <span className="page-plat"><span className="swatch" style={{ background: `var(--${l.platform})` }} />{pname(l.platform)}</span>
                                  <a href={l.url} target="_blank" rel="noreferrer" className="page-title">{l.title || l.url}</a>
                                  <span className="num page-price">{s ? fmt(s.final_price) : STATUS[latest(l)?.status ?? ''] ?? '—'}</span>
                                </li>
                              );
                            })}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="foot">蝦皮商城與酷澎會擋掉伺服器連線，價格改由 BigGo 比價網取得，可能比平台晚幾小時。</p>
      </section>

      {/* 趨勢＋本產品活動 */}
      <div className="split">
        <section className="block">
          <div className="block-head">
            <h2>每日價格趨勢</h2>
            <p>各平台同一規格的每日最低價，顯示最近 30 天。<a href={`/history?product=${tab.key}`}>查更早的價格與活動</a></p>
          </div>
          {specs.length > 1 && (
            <div className="seg" role="group" aria-label="選擇規格">
              {specs.map((s) => <button key={s} className={s === curSpec ? 'on' : ''} onClick={() => setTrendSpec(s)}>{s}</button>)}
            </div>
          )}
          {curSpec ? <TrendChart days={days} series={trendSeries} /> : <p className="empty">還沒有資料。</p>}
        </section>

        <section className="block">
          <div className="block-head">
            <h2>這個產品的活動</h2>
            <p>只列套用在本產品的折扣與組合；全站活動在下方。</p>
          </div>
          <div className="promo-list">
            {PLATFORMS.map((p) => {
              const items = Array.from(productPromos[p.key]?.values() || []);
              return (
                <div key={p.key} className="promo-plat">
                  <h3><span className="swatch" style={{ background: `var(--${p.key})` }} />{p.name}</h3>
                  {items.length ? (
                    <ul>{items.slice(0, 8).map((it, i) => (
                      <li key={i}>
                        <span className="promo-text">{it.text}</span>
                        {it.period && <span className="num promo-period">{it.period}</span>}
                        <span className="promo-specs">{Array.from(it.specs).sort(specSort).join('、')}</span>
                      </li>
                    ))}</ul>
                  ) : <p className="none">今天沒有針對本產品的活動</p>}
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* 可搭配的平台活動 */}
      <section className="block">
        <div className="block-head">
          <h2>可以疊加的平台活動</h2>
          <p>不限商品的全館滿額、刷卡與支付回饋，以及近三週的購物節消息。結帳時可以和上面的商品折扣一起用。</p>
        </div>
        <div className="platforms">
          {PLATFORMS.map((p) => {
            const sw = Array.from(sitewide[p.key]?.values() || []);
            const bk = banks.filter((b) => b.platform === p.key);
            const nw = news.filter((n) => n.platform === p.key).slice(0, 5);
            return (
              <article key={p.key} className="plat-card">
                <h3><span className="swatch" style={{ background: `var(--${p.key})` }} />{p.name}</h3>
                {sw.length > 0 && (
                  <div className="plat-sec">
                    <h4>全館活動</h4>
                    <ul>{sw.map((s, i) => <li key={i}>{s.text}{s.period && <span className="num promo-period">{s.period}</span>}</li>)}</ul>
                  </div>
                )}
                {bk.length > 0 && (
                  <div className="plat-sec">
                    <h4>刷卡與支付優惠</h4>
                    <div className="banners">
                      {bk.map((b) => (
                        <a key={b.id} href={b.url} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={b.image_url || ''} alt="momo 刷卡與支付優惠活動" loading="lazy" referrerPolicy="no-referrer" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                <div className="plat-sec">
                  <h4>近期購物節消息</h4>
                  {nw.length ? (
                    <ul className="news">{nw.map((n) => (
                      <li key={n.id}>
                        <a href={n.url} target="_blank" rel="noreferrer">{n.title}</a>
                        <span className="src">{n.source}，{n.published_at?.slice(5, 10).replace('-', '/')}</span>
                      </li>
                    ))}</ul>
                  ) : <p className="none">近三週沒有相關消息</p>}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
