// 歷史查詢：讀取指定期間、指定產品的每日價格、活動、銀行優惠與新聞
import { adminDb, fetchAll, todayTaipei, addDays } from './db';
import { PRODUCTS, CUSTOM } from './classify';
import { SITEWIDE_LINE } from './promo';
import { cleanNews } from './news';
import { isUserKey } from './custom';

export type HistoryQuery = { product: string; from: string; to: string };

const isDay = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export function parseQuery(sp: Record<string, string | undefined>): HistoryQuery {
  const today = todayTaipei();
  const product = [...PRODUCTS.map((p) => p.key), CUSTOM].includes(sp.product || '') || isUserKey(sp.product) ? sp.product! : PRODUCTS[0].key;
  let to = isDay(sp.to) ? sp.to! : today;
  let from = isDay(sp.from) ? sp.from! : addDays(to, -29);
  if (from > to) [from, to] = [to, from];
  return { product, from, to };
}

export async function loadHistory({ product, from, to }: HistoryQuery) {
  const db = adminDb();
  // 包含已停止追蹤的商品頁，歷史資料才完整
  const { data: listings } = await db.from('ec_listings').select('id,line,spec,platform,url,title,image_url,active').eq('line', product);
  const ids = (listings || []).map((l) => l.id);
  const [snaps, { data: promos }, { data: banks }, { data: news }, { data: firstDay }] = await Promise.all([
    ids.length
      ? fetchAll((a, b) => db.from('ec_price_snapshots')
          .select('listing_id,captured_on,status,list_price,final_price,promos')
          .in('listing_id', ids).gte('captured_on', from).lte('captured_on', to).eq('status', 'ok')
          .order('captured_on').order('id').range(a, b))
      : Promise.resolve([] as any[]),
    // 活動期間和查詢區間有重疊就列出
    db.from('ec_promo_log').select('*').in('line', [product, SITEWIDE_LINE]).lte('first_seen', to).gte('last_seen', from)
      .order('first_seen', { ascending: false }).limit(500),
    db.from('ec_platform_events').select('*').eq('kind', 'bank').lte('first_seen', to).gte('last_seen', from).order('id'),
    db.from('ec_platform_events').select('*').eq('kind', 'news')
      .gte('published_at', from + 'T00:00:00+08:00').lte('published_at', to + 'T23:59:59+08:00')
      .order('published_at', { ascending: false }).limit(200),
    db.from('ec_price_snapshots').select('captured_on').order('captured_on').limit(1),
  ]);
  return {
    listings: listings || [],
    snaps: snaps as { listing_id: number; captured_on: string; status: string; list_price: number | null; final_price: number | null; promos: { text: string; period?: string }[] }[],
    promos: promos || [],
    banks: (banks || []).map((b) => ({ ...b, image_url: b.archived_image_url || b.image_url })),
    news: cleanNews(news || []),
    earliest: firstDay?.[0]?.captured_on as string | undefined,
  };
}
