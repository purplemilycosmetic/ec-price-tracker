import { adminDb, todayTaipei } from './db';
import { scrape } from './scrapers';
import { classify } from './classify';

// 抓取所有啟用中的商品頁並寫入當日價格
export async function runUpdate(onlyIds?: number[]) {
  const db = adminDb();
  let q = db.from('ec_listings').select('*').eq('active', true);
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
      await new Promise((res) => setTimeout(res, 400)); // 放慢速度，避免對平台造成負擔
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  return summary;
}
