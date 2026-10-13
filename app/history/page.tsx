import { parseQuery, loadHistory } from '@/lib/history';
import { PRODUCTS, CUSTOM, productOf, productLabel } from '@/lib/classify';
import { todayTaipei, addDays } from '@/lib/db';
import { SITEWIDE_LINE } from '@/lib/promo';
import TrendChart from '../TrendChart';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const PLATFORMS = [
  { key: 'momo', name: 'momo' },
  { key: 'shopee', name: '蝦皮商城' },
  { key: 'coupang', name: '酷澎' },
];
const fmt = (n: number | null | undefined) => (n == null ? '—' : `$${Math.round(n).toLocaleString()}`);
const md = (d: string) => d.slice(5).replace('-', '/');
function specSort(a: string, b: string) {
  const v = (s: string) => { const m = s.match(/([\d.]+)\D+(?:×(\d+))?/); return m ? +m[1] * (+(m[2] || 1)) : 1e9; };
  return v(a) - v(b);
}

export default async function History({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const q = parseQuery(searchParams);
  const h = await loadHistory(q);
  const today = todayTaipei();
  const product = productOf(q.product);
  const link = (patch: Record<string, string>) => '/history?' + new URLSearchParams({ product: q.product, from: q.from, to: q.to, ...patch }).toString();
  const presets = [
    { label: '近 7 天', from: addDays(today, -6) },
    { label: '近 30 天', from: addDays(today, -29) },
    { label: '近 90 天', from: addDays(today, -89) },
    { label: '近一年', from: addDays(today, -364) },
  ];

  // 每天、每個規格、每個平台的最低價
  const byId = new Map(h.listings.map((l) => [l.id, l]));
  const daily = new Map<string, Map<string, Map<string, { price: number; url: string }>>>(); // spec → platform → day → min
  for (const s of h.snaps) {
    const l = byId.get(s.listing_id);
    if (!l || s.final_price == null) continue;
    const spec = l.spec || '未標示規格';
    if (!daily.has(spec)) daily.set(spec, new Map());
    const byP = daily.get(spec)!;
    if (!byP.has(l.platform)) byP.set(l.platform, new Map());
    const cur = byP.get(l.platform)!.get(s.captured_on);
    if (!cur || s.final_price < cur.price) byP.get(l.platform)!.set(s.captured_on, { price: s.final_price, url: l.url });
  }
  const specs = Array.from(daily.keys()).sort(specSort);
  const days = Array.from(new Set(h.snaps.map((s) => s.captured_on))).sort();
  const curSpec = searchParams.spec && specs.includes(searchParams.spec) ? searchParams.spec
    : [...specs].sort((a, b) => daily.get(b)!.size - daily.get(a)!.size)[0];

  const summary = specs.map((spec) => ({
    spec,
    cells: PLATFORMS.map((p) => {
      const pts = Array.from(daily.get(spec)!.get(p.key)?.entries() || []);
      if (!pts.length) return null;
      const prices = pts.map(([, v]) => v.price);
      const min = Math.min(...prices), max = Math.max(...prices);
      const minDay = pts.filter(([, v]) => v.price === min).map(([d]) => d);
      return { min, max, avg: prices.reduce((a, b) => a + b, 0) / prices.length, minDay, n: pts.length };
    }),
  }));

  const series = PLATFORMS.map((p) => ({
    key: p.key, name: p.name,
    pts: days.map((d) => daily.get(curSpec ?? '')?.get(p.key)?.get(d)?.price ?? null),
  }));

  const promosBy = (platform: string, sitewide: boolean) =>
    h.promos.filter((p) => p.platform === platform && (p.line === SITEWIDE_LINE) === sitewide);

  return (
    <main className="page">
      <section className="search-head">
        <h1 className="display">歷史價格與活動</h1>
        <p className="lede">
          選產品和日期區間，查看那段期間各平台的每日最低價、出現過的活動、刷卡優惠和購物節消息。
          {h.earliest && <>資料從 {h.earliest} 開始累積。</>}
        </p>
      </section>

      <form className="hist-form" action="/history">
        <label>產品
          <select name="product" defaultValue={q.product}>
            {PRODUCTS.map((p) => <option key={p.key} value={p.key}>{productLabel(p)}</option>)}
            <option value={CUSTOM}>自訂追蹤</option>
          </select>
        </label>
        <label>開始日期<input type="date" name="from" defaultValue={q.from} max={today} /></label>
        <label>結束日期<input type="date" name="to" defaultValue={q.to} max={today} /></label>
        <button className="primary" type="submit">查詢</button>
      </form>
      <div className="seg presets" role="group" aria-label="快速選擇期間">
        {presets.map((p) => (
          <a key={p.label} className={q.from === p.from && q.to === today ? 'on' : ''} href={link({ from: p.from, to: today })}>{p.label}</a>
        ))}
      </div>

      <section className="block">
        <div className="block-head">
          <h2>{product ? productLabel(product) : '自訂追蹤'}｜{q.from} 到 {q.to}</h2>
          <p>{days.length ? `這段期間有 ${days.length} 天的價格資料。` : '這段期間沒有價格資料。'}</p>
          {days.length > 0 && <a className="btn-add export" href={`/api/export?${new URLSearchParams({ product: q.product, from: q.from, to: q.to })}`}>下載 CSV</a>}
        </div>

        {summary.length > 0 && (
          <div className="table-wrap">
            <table className="grid-table hist-table">
              <thead>
                <tr><th scope="col">規格</th>{PLATFORMS.map((p) => <th key={p.key} scope="col"><span className="swatch" style={{ background: `var(--${p.key})` }} />{p.name}</th>)}</tr>
              </thead>
              <tbody>
                {summary.map(({ spec, cells }) => {
                  const best = Math.min(...cells.map((c) => c?.min ?? Infinity));
                  return (
                    <tr key={spec} className="row-static">
                      <th scope="row"><span className="spec-name">{spec}</span></th>
                      {cells.map((c, i) => c ? (
                        <td key={i} data-label={PLATFORMS[i].name}>
                          <span className="num price">{fmt(c.min)}</span>
                          {c.min === best && cells.filter(Boolean).length > 1 && <span className="lowest">最低</span>}
                          <span className="hist-sub">最低在 {c.minDay.slice(-3).map(md).join('、')}{c.minDay.length > 3 ? ' 等' : ''}</span>
                          {c.max !== c.min && <span className="hist-sub num">最高 {fmt(c.max)}，平均 {fmt(c.avg)}</span>}
                        </td>
                      ) : <td key={i} className="na" data-label={PLATFORMS[i].name}>無資料</td>)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="foot">表內是期間內每天最低折後價的統計；「最低在」列出最低價出現的日期（最多三天）。</p>
      </section>

      {days.length > 0 && curSpec && (
        <section className="block">
          <div className="block-head"><h2>每日價格</h2><p>選規格看期間內的走勢；展開「以表格檢視」可看每天的數字。</p></div>
          <div className="seg" role="group" aria-label="選擇規格">
            {specs.map((s) => <a key={s} className={s === curSpec ? 'on' : ''} href={link({ spec: s })}>{s}</a>)}
          </div>
          <TrendChart days={days} series={series} />
        </section>
      )}

      <section className="block">
        <div className="block-head"><h2>期間內的活動</h2><p>每則活動標示這個網站第一次與最後一次看到的日期，以及平台標示的活動期間。</p></div>
        <div className="platforms">
          {PLATFORMS.map((p) => {
            const own = promosBy(p.key, false);
            const site = promosBy(p.key, true);
            return (
              <article key={p.key} className="plat-card">
                <h3><span className="swatch" style={{ background: `var(--${p.key})` }} />{p.name}</h3>
                <div className="plat-sec">
                  <h4>本產品活動</h4>
                  {own.length ? <ul className="log">{own.map((r) => (
                    <li key={r.id}>
                      <span className="promo-text">{r.text}</span>
                      <span className="hist-sub num">看到 {md(r.first_seen)}{r.last_seen !== r.first_seen && ` ～ ${md(r.last_seen)}`}{r.period && `，平台標示 ${r.period}`}</span>
                      {r.specs?.length > 0 && <span className="hist-sub">{[...r.specs].sort(specSort).join('、')}</span>}
                    </li>
                  ))}</ul> : <p className="none">沒有紀錄</p>}
                </div>
                {site.length > 0 && (
                  <div className="plat-sec">
                    <h4>全站活動</h4>
                    <ul className="log">{site.map((r) => (
                      <li key={r.id}><span className="promo-text">{r.text}</span>
                        <span className="hist-sub num">看到 {md(r.first_seen)}{r.last_seen !== r.first_seen && ` ～ ${md(r.last_seen)}`}{r.period && `，平台標示 ${r.period}`}</span></li>
                    ))}</ul>
                  </div>
                )}
                {p.key === 'momo' && h.banks.length > 0 && (
                  <div className="plat-sec">
                    <h4>刷卡與支付優惠</h4>
                    <div className="banners">
                      {h.banks.map((b) => (
                        <a key={b.id} href={b.url} target="_blank" rel="noreferrer" title={`看到 ${md(b.first_seen)} ～ ${md(b.last_seen)}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={b.image_url || ''} alt="momo 刷卡與支付優惠活動" loading="lazy" referrerPolicy="no-referrer" />
                          <span className="hist-sub num">{md(b.first_seen)} ～ {md(b.last_seen)}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                <div className="plat-sec">
                  <h4>購物節消息</h4>
                  {h.news.filter((n) => n.platform === p.key).length ? (
                    <ul className="news">{h.news.filter((n) => n.platform === p.key).slice(0, 12).map((n) => (
                      <li key={n.id}><a href={n.url} target="_blank" rel="noreferrer">{n.title}</a>
                        <span className="src">{n.source}，{n.published_at?.slice(0, 10)}</span></li>
                    ))}</ul>
                  ) : <p className="none">這段期間沒有消息</p>}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
