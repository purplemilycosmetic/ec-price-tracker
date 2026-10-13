import { adminDb, todayTaipei } from './db';
import { scrape } from './scrapers';
import { classify } from './classify';
import { BIGGO_QUERIES, searchBiggo } from './biggo';

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

  async function worker() {
    while (queue.length) {
      const l = queue.shift()!;
      const r = await scrape(l.platform, l.url);
      if (r.title) {
        const c = classify(r.title);
        const patch: any = { title: r.title, spec: c.spec ?? l.spec, brand: l.brand || c.brand, line: l.line || c.line };
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
      if (r.status === 'ok') summary.ok++; else if (r.status === 'blocked') summary.blocked++; else summary.failed++;
      await new Promise((res) => setTimeout(res, 200)); // 放慢速度，避免對平台造成負擔
    }
  }
  const biggo = onlyIds?.length ? Promise.resolve({}) : runBiggo(day).catch((e) => ({ biggo_error: String(e) }));
  await Promise.all([worker(), worker(), worker(), worker()]);
  Object.assign(summary, await biggo);
  return summary;
}

// 蝦皮商城、酷澎：從 BigGo 搜尋結果整批更新（搜尋同時進行、資料庫整批寫入，避免超過執行時間）
export async function runBiggo(day: string) {
  const db = adminDb();
  const found = new Map<string, { platform: string; title: string; url: string; price: number }>();
  let searchFailed = 0;
  const results = await Promise.all(BIGGO_QUERIES.map((q, i) =>
    new Promise((res) => setTimeout(res, i * 150)).then(() => searchBiggo(q)).catch(() => ({ status: 0, items: [] as any[] }))));
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
  if (!items.length) return { biggo_found: 0, biggo_search_failed: searchFailed };

  const { data: existing } = await db.from('ec_listings').select('id,url,active').in('url', items.map((i) => i.url));
  const byUrl = new Map((existing || []).map((e) => [e.url, e]));
  const fresh = items.filter((i) => !byUrl.has(i.url)).map((i) => {
    const c = classify(i.title);
    return { platform: i.platform, url: i.url, title: i.title, brand: c.brand, line: c.line, spec: c.spec };
  });
  if (fresh.length) {
    const { data } = await db.from('ec_listings').insert(fresh).select('id,url,active');
    for (const d of data || []) byUrl.set(d.url, d);
  }
  const snaps = items
    .map((i) => ({ i, l: byUrl.get(i.url) }))
    .filter(({ l }) => l && l.active) // 手動停用的不再追蹤
    .map(({ i, l }) => ({
      listing_id: l!.id, captured_on: day, captured_at: new Date().toISOString(), status: 'ok',
      final_price: i.price, sale_price: i.price, promos: [], in_stock: true, error: '來源：BigGo',
    }));
  if (snaps.length) await db.from('ec_price_snapshots').upsert(snaps, { onConflict: 'listing_id,captured_on' });
  return { biggo_found: snaps.length, biggo_search_failed: searchFailed };
}
