import { adminDb, todayTaipei, addDays } from '@/lib/db';
import { PRODUCTS, CUSTOM, productLabel } from '@/lib/classify';
import { loadUserProducts } from '@/lib/custom';
import { decode, loadLines, CMP_PLATFORMS, CMP_COLORS } from '@/lib/compare';
import TrendChart from '../TrendChart';
import Builder from './Builder';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const isDay = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const fmt = (n: number | null | undefined) => (n == null ? '—' : `$${Math.round(n).toLocaleString()}`);
function specSort(a: string, b: string) {
  const v = (s: string) => { const m = s.match(/([\d.]+)\D+(?:×(\d+))?/); return m ? +m[1] * (+(m[2] || 1)) : 1e9; };
  return v(a) - v(b);
}

export default async function Compare({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const today = todayTaipei();
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  let to = isDay(one(searchParams.to)) ? one(searchParams.to)! : today;
  let from = isDay(one(searchParams.from)) ? one(searchParams.from)! : addDays(to, -29);
  if (from > to) [from, to] = [to, from];
  // 多條線用「!」串在同一個參數裡（也相容重複的 s 參數）
  const raw = (searchParams.s ? ([] as string[]).concat(searchParams.s as any) : []).flatMap((x) => x.split('!'));
  const lines = raw.map(decode).filter((l): l is NonNullable<typeof l> => !!l).slice(0, 6);

  // 選單：所有有資料的產品（含已停止追蹤的）與各自的規格
  const [users, { data: ls }] = await Promise.all([
    loadUserProducts(true),
    adminDb().from('ec_listings').select('line,spec').in('platform', ['momo', 'shopee', 'coupang']),
  ]);
  const specs: Record<string, string[]> = {};
  for (const l of ls || []) {
    if (!l.line) continue;
    (specs[l.line] ||= []);
    const sp = l.spec || '未標示規格';
    if (!specs[l.line].includes(sp)) specs[l.line].push(sp);
  }
  for (const k of Object.keys(specs)) specs[k].sort(specSort);
  const products = [
    ...PRODUCTS.map((p) => ({ key: p.key, name: productLabel(p) })),
    ...users.map((u) => ({ key: u.key, name: u.name })),
    { key: CUSTOM, name: '自訂追蹤' },
  ].filter((p) => specs[p.key]?.length);
  const nameOf = (k: string) => products.find((p) => p.key === k)?.name ?? k;

  const { days, series, counts } = await loadLines(lines, from, to);
  const label = (i: number) => {
    const l = lines[i];
    return `${nameOf(l.product)}｜${l.spec || '全部規格'}｜${CMP_PLATFORMS.find((p) => p.key === l.platform)?.name}｜${l.stat === 'min' ? '最低' : '平均'}${l.coupon ? '・券後' : ''}${l.unit ? '（每入）' : ''}`;
  };
  const chart = lines.map((_, i) => ({ key: `c${i}`, name: label(i), pts: series[i], color: CMP_COLORS[i] }));

  return (
    <main className="page">
      <section className="search-head">
        <h1 className="display">價格比較</h1>
        <p className="lede">把不同產品、規格、平台的每日價格放在同一張圖比較。例如「雅漾活泉水 300ml×3 的平均價」對「AHC B5 精華 30ml 的平均價」，或勾選「換算每入」比較多入組平均每一入的價格；勾選「帶入券後價」會用當天有效的優惠券計算。</p>
      </section>

      <Builder products={products} specs={specs} initial={lines} from={from} to={to} today={today} />

      {lines.length > 0 && (
        <>
          <section className="block">
            <div className="block-head"><h2>每日價格</h2><p>{from} 到 {to}。「平均」是當天所選平台、所選規格所有商品頁折後價的平均；「最低」是當天最低價。</p></div>
            {days.length ? <TrendChart days={days} series={chart} endLabels={false} /> : <p className="empty">這段期間沒有價格資料。</p>}
          </section>
          <section className="block">
            <div className="block-head"><h2>期間統計</h2></div>
            <div className="table-wrap">
              <table className="grid-table hist-table">
                <thead><tr><th scope="col">比較項目</th><th scope="col">期間平均</th><th scope="col">最低</th><th scope="col">最高</th><th scope="col">最新</th><th scope="col">商品頁數</th></tr></thead>
                <tbody>
                  {lines.map((_, i) => {
                    const v = series[i].filter((x): x is number => x != null);
                    let last: number | null = null; for (const x of series[i]) if (x != null) last = x;
                    return (
                      <tr key={i} className="row-static">
                        <th scope="row"><span className="dot" style={{ background: CMP_COLORS[i], display: 'inline-block', width: 10, height: 10, borderRadius: 5, marginRight: 8 }} />{label(i)}</th>
                        <td data-label="期間平均" className="num">{v.length ? fmt(v.reduce((a, b) => a + b, 0) / v.length) : '—'}</td>
                        <td data-label="最低" className="num">{v.length ? fmt(Math.min(...v)) : '—'}</td>
                        <td data-label="最高" className="num">{v.length ? fmt(Math.max(...v)) : '—'}</td>
                        <td data-label="最新" className="num">{fmt(last)}</td>
                        <td data-label="商品頁數" className="num">{counts[i]}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="foot">「換算每入」用規格裡的入數計算，例如 300ml×3 的價格除以 3；組合包與沒寫入數的規格視為 1 入。</p>
          </section>
        </>
      )}
    </main>
  );
}
