import { searchBiggo } from '@/lib/biggo';
import { searchMomo } from '@/lib/momoSearch';
import { classify, productOf, PRODUCTS, productLabel } from '@/lib/classify';
import { loadUserProducts, loadHidden } from '@/lib/custom';
import AddButton from './AddButton';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

type Hit = { platform: string; store: string; title: string; url: string; price: number; image: string | null; spec: string | null; tracked: string | null };

const ORDER = ['momo', 'shopee', 'coupang', 'pchome', 'other'];
const NAMES: Record<string, string> = { momo: 'momo', shopee: '蝦皮商城', coupang: '酷澎', pchome: 'PChome 24h', other: '其他商店' };

export default async function Search({ searchParams }: { searchParams: { q?: string; sort?: string } }) {
  const q = (searchParams.q || '').trim().slice(0, 60);
  const sort = searchParams.sort === 'price' ? 'price' : 'relevance';
  const [users, hidden] = await Promise.all([loadUserProducts(), loadHidden()]);
  const choices = [
    ...PRODUCTS.filter((p) => !hidden.has(p.key)).map((p) => ({ key: p.key, name: productLabel(p) })),
    ...users.map((u) => ({ key: u.key, name: u.name })),
  ];
  let hits: Hit[] = [];
  let failed: string[] = [];
  let crash = '';
  if (q) try {
    const [m, b] = await Promise.all([
      searchMomo(q).catch(() => ({ status: 0, items: [] })),
      searchBiggo(q, true).catch(() => ({ status: 0, items: [] }))
        // BigGo 偶爾因短時間請求太多而拒絕，等一秒半再試一次
        .then((r) => r.status === 200 ? r : new Promise((ok) => setTimeout(ok, 1500)).then(() => searchBiggo(q, true)).catch(() => ({ status: 0, items: [] }))),
    ]);
    if (m.status !== 200) failed.push('momo');
    if (b.status !== 200) failed.push('蝦皮商城、酷澎等');
    const tag = (title: string) => { const c = classify(title); return { spec: c.spec, tracked: c.line } };
    hits = [
      ...m.items.map((i) => ({ platform: 'momo', store: 'momo', title: i.title, url: i.url, price: i.price, image: i.image, ...tag(i.title) })),
      ...b.items.map((i) => ({ platform: i.platform, store: i.storeName, title: i.title, url: i.url, price: i.price, image: i.image ?? null, ...tag(i.title) })),
    ];
  } catch (e: any) { crash = String(e?.stack || e).slice(0, 600); }
  const groups = ORDER.map((p) => {
    const list = hits.filter((h) => h.platform === p);
    if (sort === 'price') list.sort((a, b) => a.price - b.price);
    return { p, list };
  }).filter((g) => g.list.length);
  const lowest = hits.length ? Math.min(...hits.map((h) => h.price)) : null;

  return (
    <main className="page">
      <section className="search-head">
        <h1 className="display">{q ? `「${q}」的搜尋結果` : '搜尋商品'}</h1>
        {q ? (
          <p className="lede">
            共 {hits.length} 筆，來自 {groups.map((g) => NAMES[g.p]).join('、') || '—'}
            {lowest != null && <>，最低 <b className="num">${lowest.toLocaleString()}</b></>}。
            想每天追蹤，按商品右邊的「加入追蹤」。
          </p>
        ) : (
          <p className="lede">輸入品牌或品名，會同時搜尋 momo、蝦皮商城、酷澎、PChome 等通路的即時價格。</p>
        )}
        {q && (
          <div className="seg" role="group" aria-label="排序">
            <a className={sort === 'relevance' ? 'on' : ''} href={`/search?q=${encodeURIComponent(q)}`}>相關度</a>
            <a className={sort === 'price' ? 'on' : ''} href={`/search?q=${encodeURIComponent(q)}&sort=price`}>價格低到高</a>
          </div>
        )}
        {crash && <pre className="warn" style={{ whiteSpace: 'pre-wrap' }}>搜尋時發生錯誤：{crash}</pre>}
        {failed.length > 0 && <p className="warn">{failed.join('、')} 這次沒有回應，結果可能不完整，稍後再搜一次。</p>}
      </section>

      {q && !hits.length && !failed.length && (
        <p className="empty">找不到符合「{q}」的商品。試試只輸入品牌加品名，例如「AHC B5 精華」。</p>
      )}

      {groups.map(({ p, list }) => (
        <section key={p} className="result-group">
          <h2 className="group-title"><span className="swatch" style={{ background: `var(--${p}, var(--muted))` }} />{NAMES[p]}<span className="count">{list.length}</span></h2>
          <ul className="results">
            {list.slice(0, 24).map((h) => (
              <li key={h.url} className="result">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {h.image ? <img src={h.image} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="noimg" />}
                <div className="result-body">
                  <a href={h.url} target="_blank" rel="noreferrer" className="result-title">{h.title}</a>
                  <div className="result-meta">
                    {h.store !== NAMES[p] && <span>{h.store}</span>}
                    {h.spec && <span>{h.spec}</span>}
                    {h.tracked && <span className="tracked">已在「{productOf(h.tracked)?.short}」追蹤範圍</span>}
                  </div>
                </div>
                <div className="result-side">
                  <span className={`num price-lg ${h.price === lowest ? 'is-low' : ''}`}>${h.price.toLocaleString()}</span>
                  {['momo', 'shopee', 'coupang'].includes(p) && !h.tracked && (
                    <AddButton url={h.url} title={h.title} price={h.price} image={h.image} query={q} products={choices} />
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
