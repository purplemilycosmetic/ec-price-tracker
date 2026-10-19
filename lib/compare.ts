// 比較：從資料庫讀出每條線的每日價格
import { adminDb, fetchAll } from './db';
import { unitsOf, type Line } from './compareShared';
export * from './compareShared';

export async function loadLines(lines: Line[], from: string, to: string) {
  const db = adminDb();
  const products = Array.from(new Set(lines.map((l) => l.product)));
  if (!products.length) return { days: [] as string[], series: [] as (number | null)[][], counts: [] as number[] };
  const { data: ls } = await db.from('ec_listings').select('id,line,spec,platform').in('line', products);
  const listings = ls || [];
  const ids = listings.map((l) => l.id);
  const snaps = ids.length ? await fetchAll((a, b) => db.from('ec_price_snapshots').select('listing_id,captured_on,final_price')
    .in('listing_id', ids).gte('captured_on', from).lte('captured_on', to).eq('status', 'ok').not('final_price', 'is', null)
    .order('captured_on').order('id').range(a, b)) as { listing_id: number; captured_on: string; final_price: number }[] : [];
  const days = Array.from(new Set(snaps.map((s) => s.captured_on))).sort();
  const byId = new Map(listings.map((l) => [l.id, l]));
  const counts: number[] = [];
  const series = lines.map((ln) => {
    const pick = new Set(listings.filter((l) => l.line === ln.product && (!ln.spec || (l.spec || '未標示規格') === ln.spec)
      && (ln.platform === 'all' || l.platform === ln.platform) && ['momo', 'shopee', 'coupang'].includes(l.platform)).map((l) => l.id));
    counts.push(pick.size);
    const perDay = new Map<string, number[]>();
    for (const s of snaps) {
      if (!pick.has(s.listing_id)) continue;
      const v = ln.unit ? s.final_price / unitsOf(byId.get(s.listing_id)!.spec) : s.final_price;
      if (!perDay.has(s.captured_on)) perDay.set(s.captured_on, []);
      perDay.get(s.captured_on)!.push(v);
    }
    return days.map((d) => {
      const v = perDay.get(d);
      if (!v?.length) return null;
      return Math.round(ln.stat === 'min' ? Math.min(...v) : v.reduce((a, b) => a + b, 0) / v.length);
    });
  });
  return { days, series, counts };
}
