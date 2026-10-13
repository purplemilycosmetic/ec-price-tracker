import { adminDb, todayTaipei } from './db';
import { scrape } from './scrapers';
import { classify } from './classify';
import { BIGGO_QUERIES, searchBiggo, type BiggoItem } from './biggo';
import { fetchNews } from './news';

// 抓取所有啟用中的商品頁並寫入當日價格
export async function runUpdate(onlyIds?: number[]) {
  const db = adminDb();
  let q = db.from('ec_listings').select('*').eq('active', true).not('platform', 'in', '(shopee,coupang)');
  if (onlyIds?.length) q = q.in('id', onlyIds);
  const { data: listings, error } = await q;
  if (error) throw error;

  const day = todayTaipei();
  const summary = { total: listings!.length, ok: 0, blocked: 0, failed: 0, deactivated: 0 };
  const queue = [...listings!];
  const banners: { href: string; src: string }[] = [];

  async function worker() {
    while (queue.length) {
      const l = queue.shift()!;
      const r = await scrape(l.platform, l.url);
      if (r.title && r.status === 'ok') {
        const c = classify(r.title);
        const patch: any = { title: r.title, spec: c.spec ?? l.spec, brand: l.brand || c.brand, line: l.line || c.line, image_url: r.image ?? l.image_url };
        // 種子清單中不屬於追蹤品項的商品（例如防曬）自動停用
        if (!l.brand && !l.line && (!c.brand || !c.line)) { patch.active = false; summary.deactivated++; }
        await db.from('ec_listings').update(patch).eq('id', l.id);
      }
      await db.from('ec_price_snapshots').upsert(
        {
          listing_id: l.id, captured_on: day, captured_at: new Date().toISOString(), status: r.status,
          list_price: r.list_price ?? null, sale_price: r.sale_price ?? null, final_price: r.final_price ?? null,
          promos: r.promos ?? [], in_stock: r.in_stock ?? null, error: r.error ?? null,
        },
        { onConflict: 'listing_id,captured_on' },
      );
      if (r.banners?.length && !banners.length) banners.push(...r.banners);
      if (r.status === 'ok') summary.ok++; else if (r.status === 'blocked') summary.blocked++; else summary.failed++;
      await new Promise((res) => setTimeout(res, 200)); // 放慢速度，避免對平台造成負擔
    }
  }
  const full = !onlyIds?.length;
  const biggo = full ? runBiggo(day).catch((e) => ({ biggo_error: String(e) })) : Promise.resolve({});
  const news = full ? runNews(day).catch((e) => ({ news_error: String(e) })) : Promise.resolve({});
  await Promise.all([worker(), worker(), worker(), worker()]);
  if (banners.length) {
    await db.from('ec_platform_events').upsert(
      banners.map((b) => ({ platform: 'momo', kind: 'bank', title: '銀行／支付優惠', url: b.href, image_url: b.src, source: 'momo', last_seen: day })),
      { onConflict: 'platform,url' },
    );
  }
  Object.assign(summary, { momo_bank_banners: banners.length }, await biggo, await news);
  return summary;
}

// 平台大型活動新聞
export async function runNews(day: string) {
  const items = await fetchNews();
  if (items.length)
    await adminDb().from('ec_platform_events').upsert(
      items.map((n) => ({ platform: n.platform, kind: 'news', title: n.title, url: n.url, source: n.source, published_at: n.published_at, last_seen: day })),
      { onConflict: 'platform,url' },
    );
  return { news_found: items.length };
}

// 蝦皮商城、酷澎：從 BigGo 搜尋結果整批更新（搜尋同時進行、資料庫整批寫入，避免超過執行時間）
export async function runBiggo(day: string) {
  const db = adminDb();
  const found = new Map<string, BiggoItem>();
  let searchFailed = 0;
  const statuses: Record<string, number> = {};
  // 一次一個關鍵字、間隔 1.5 秒，失敗再等 3 秒重試一次，避免被 BigGo 當成大量請求擋掉
  const results: { status: number; items: any[] }[] = [];
  const t0 = Date.now();
  for (const q of BIGGO_QUERIES) {
    if (Date.now() - t0 > 45000) break; // 保留時間給資料庫寫入
    let r = await searchBiggo(q).catch((e) => ({ status: -1, items: [] as any[], err: String(e) }));
    if (r.status !== 200 && Date.now() - t0 < 25000) { await new Promise((res) => setTimeout(res, 3000)); r = await searchBiggo(q).catch(() => ({ status: -1, items: [] as any[] })); }
    statuses[r.status] = (statuses[r.status] || 0) + 1;
    results.push(r);
    await new Promise((res) => setTimeout(res, 1500));
  }
  for (const { status, items } of results) {
    if (status !== 200) searchFailed++;
    for (const it of items) {
      const c = classify(it.title);
      if (!c.brand || !c.line) continue; // 只留追蹤中的品項
      if (/非賣品|贈品|請勿下單|兌換|0元加購/.test(it.title) || it.price >= 9999) continue; // 贈品、佔位商品
      const prev = found.get(it.url);
      if (!prev || it.price < prev.price) found.set(it.url, it);
    }
  }
  const items = Array.from(found.values());
  if (!items.length) return { biggo_found: 0, biggo_search_failed: searchFailed, biggo_status: statuses };

  // 新商品加入、既有商品更新標題與規格（不會動到手動停用的設定）
  const rows = items.map((i) => {
    const c = classify(i.title);
    return { platform: i.platform, url: i.url, title: i.title, brand: c.brand, line: c.line, spec: c.spec, image_url: i.image ?? null };
  });
  const { data: saved, error } = await db.from('ec_listings').upsert(rows, { onConflict: 'url' }).select('id,url,active');
  if (error) throw error;
  const byUrl = new Map((saved || []).map((e) => [e.url, e]));
  const snaps = items
    .map((i) => ({ i, l: byUrl.get(i.url) }))
    .filter(({ l }) => l && l.active) // 手動停用的不再追蹤
    .map(({ i, l }) => ({
      listing_id: l!.id, captured_on: day, captured_at: new Date().toISOString(), status: 'ok',
      final_price: i.price, sale_price: i.price, promos: i.promos, in_stock: true, error: '來源：BigGo',
    }));
  if (snaps.length) await db.from('ec_price_snapshots').upsert(snaps, { onConflict: 'listing_id,captured_on' });
  return { biggo_found: snaps.length, biggo_search_failed: searchFailed, biggo_status: statuses };
}
