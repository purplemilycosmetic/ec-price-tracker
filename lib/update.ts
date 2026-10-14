import { adminDb, todayTaipei } from './db';
import { scrape } from './scrapers';
import { classify, CUSTOM, PRODUCTS, productOf } from './classify';
import { isUserKey, loadUserProducts } from './custom';
import { searchMomo } from './momoSearch';
import { fetchAllOfficial } from './official';
import { BIGGO_QUERIES, searchBiggo, type BiggoItem } from './biggo';
import { fetchNews } from './news';
import { logPromos, archiveBanners } from './archive';
import { jobLog, logJob } from './jobs';

// 抓取所有啟用中的商品頁並寫入當日價格
export async function runUpdate(onlyIds?: number[]) {
  const db = adminDb();
  const full = !onlyIds?.length;
  const day = todayTaipei();
  // 蝦皮／酷澎、新聞、官網和 momo 搜尋同時進行，總時間才不會超過 Vercel 的 60 秒上限
  const biggo = full ? runBiggo(day).catch((e) => ({ biggo_error: String(e) })) : Promise.resolve({});
  const news = full ? runNews(day).catch((e) => ({ news_error: String(e) })) : Promise.resolve({});
  const official = full ? runOfficial().catch((e) => ({ official_error: String(e) })) : Promise.resolve({});
  const discovered = full ? await discoverMomo().catch(() => 0) : 0;
  let q = db.from('ec_listings').select('*').eq('active', true).not('platform', 'in', '(shopee,coupang)');
  if (onlyIds?.length) q = q.in('id', onlyIds);
  const { data: listings, error } = await q;
  if (error) throw error;

  const summary = { total: listings!.length, ok: 0, blocked: 0, failed: 0, deactivated: 0, momo_new_found: discovered };
  const queue = [...listings!];
  const banners: { href: string; src: string }[] = [];

  async function worker() {
    while (queue.length) {
      const l = queue.shift()!;
      const r = await scrape(l.platform, l.url);
      if (r.title && r.status === 'ok') {
        const c = classify(r.title);
        const custom = l.line === CUSTOM || isUserKey(l.line); // 自訂與使用者自建產品：不自動改分類
        const patch: any = { title: r.title, spec: c.spec ?? l.spec, image_url: r.image ?? l.image_url };
        if (!custom) {
          // 每次都依最新的產品定義重新分類；不屬於追蹤產品的商品頁（例如防曬）自動停用
          if (c.line) { patch.brand = c.brand; patch.line = c.line; }
          else if (l.line == null) patch.line = CUSTOM; // 剛加入、不屬於預設產品 → 自訂追蹤
          else { patch.active = false; summary.deactivated++; } // 原本屬於某產品、現在對不上 → 停用
        }
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
      // 從沒抓到過資料、momo 又回系統訊息頁的商品頁（多半是已停售的舊品號）不再追蹤
      if (!l.title && r.status !== 'ok' && /系統訊息/.test(r.error || '')) {
        await db.from('ec_listings').update({ active: false }).eq('id', l.id);
        summary.deactivated++;
      }
      if (r.banners?.length && !banners.length) banners.push(...r.banners);
      if (r.status === 'ok') summary.ok++; else if (r.status === 'blocked') summary.blocked++; else summary.failed++;
      await new Promise((res) => setTimeout(res, 200)); // 放慢速度，避免對平台造成負擔
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  if (banners.length) {
    await db.from('ec_platform_events').upsert(
      banners.map((b) => ({ platform: 'momo', kind: 'bank', title: '銀行／支付優惠', url: b.href, image_url: b.src, source: 'momo', last_seen: day })),
      { onConflict: 'platform,url' },
    );
  }
  Object.assign(summary, { momo_bank_banners: banners.length }, await biggo, await news, await official);
  if (full) {
    // 所有價格寫完後，整理當天的活動紀錄並備份新的銀行優惠圖片
    const [promos_logged, banners_archived] = await Promise.all([logPromos(day).catch(() => -1), archiveBanners().catch(() => -1)]);
    Object.assign(summary, { promos_logged, banners_archived });
  }
  return summary;
}

// momo：每天用產品關鍵字搜尋，找到的新規格／新組合自動加入追蹤
export async function discoverMomo() {
  const db = adminDb();
  const rows: any[] = [];
  const jobs = PRODUCTS.flatMap((p) => p.queries.map((q) => ({ p, q })));
  // 同時搜尋（間隔 250ms 錯開），避免拖長整體執行時間
  const results = await Promise.all(jobs.map(({ q }, i) =>
    new Promise((r) => setTimeout(r, i * 250)).then(() => searchMomo(q)).catch(() => ({ items: [] as any[] }))));
  for (let i = 0; i < results.length; i++) {
    const { items } = results[i];
    const p = jobs[i].p;
    for (const it of items) {
      const c = classify(it.title);
      if (c.line === p.key && !rows.some((r) => r.url === it.url))
        rows.push({ platform: 'momo', url: it.url, title: it.title, brand: c.brand, line: c.line, spec: c.spec, image_url: it.image });
    }
  }
  if (!rows.length) return 0;
  const { data } = await db.from('ec_listings').upsert(rows, { onConflict: 'url', ignoreDuplicates: true }).select('id');
  return data?.length ?? 0;
}

// 品牌官網：正式品名、官方圖片、授權通路；官網列出的 momo 商品頁自動加入追蹤
export async function runOfficial() {
  const db = adminDb();
  const infos = await fetchAllOfficial();
  if (infos.length) await db.from('ec_products').upsert(infos.map((i) => ({ ...i, updated_at: new Date().toISOString() })), { onConflict: 'key' });
  const momo = infos.flatMap((i) => i.channels.filter((c) => c.name === 'momo').map((c) => ({ key: i.key, code: c.url.match(/i_code=(\d+)/)?.[1] })))
    .filter((m) => m.code);
  if (momo.length)
    await db.from('ec_listings').upsert(
      momo.map((m) => ({ platform: 'momo', url: `https://www.momoshop.com.tw/goods/GoodsDetail.jsp?i_code=${m.code}`, line: m.key })),
      { onConflict: 'url', ignoreDuplicates: true },
    );
  return { official_products: infos.length, official_momo_links: momo.length };
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
export async function runBiggo(day: string, opts: { onlyPending?: boolean; budgetMs?: number } = {}) {
  const budget = opts.budgetMs ?? 45000;
  const db = adminDb();
  const found = new Map<string, BiggoItem>();
  let searchFailed = 0;
  const statuses: Record<string, number> = {};
  // 一次一個關鍵字、間隔 1.5 秒，失敗再等 3 秒重試一次，避免被 BigGo 當成大量請求擋掉
  const results: { status: number; items: any[] }[] = [];
  const t0 = Date.now();
  // 自行搜尋加入追蹤的商品：用當初的關鍵字每天再搜一次，依網址對回
  const [{ data: watch }, { data: customs }, userProducts] = await Promise.all([
    db.from('ec_watch_queries').select('query'),
    db.from('ec_listings').select('url,line').eq('active', true).in('platform', ['shopee', 'coupang']),
    loadUserProducts(),
  ]);
  // 網址 → 使用者指定的產品（自訂追蹤或自建產品）；內建產品由標題自動判斷
  const customLine = new Map((customs || []).filter((c) => c.line && !productOf(c.line)).map((c) => [c.url as string, c.line as string]));
  const customUrls = new Set(Array.from(customLine.keys()));
  let queries = Array.from(new Set([...BIGGO_QUERIES, ...(watch || []).map((w) => w.query), ...userProducts.flatMap((u) => u.queries)]));
  // 每小時補抓：今天已經抓到資料的關鍵字跳過，只重抓失敗的
  const log = await jobLog(day, 'biggo:');
  if (opts.onlyPending) queries = queries.filter((q) => !log.get('biggo:' + q)?.ok && (log.get('biggo:' + q)?.attempts ?? 0) < 24);
  let skipped = 0;
  for (const q of queries) {
    if (Date.now() - t0 > budget) { skipped++; continue; } // 保留時間給資料庫寫入，剩下的下一小時再抓
    let r = await searchBiggo(q).catch((e) => ({ status: -1, items: [] as any[], err: String(e) }));
    if ((r.status !== 200 || !r.items.length) && Date.now() - t0 < budget - 15000) { await new Promise((res) => setTimeout(res, 3000)); r = await searchBiggo(q).catch(() => ({ status: -1, items: [] as any[] })); }
    statuses[r.status] = (statuses[r.status] || 0) + 1;
    results.push(r);
    await logJob(day, 'biggo:' + q, { ok: r.status === 200 && r.items.length > 0, status: r.status, items: r.items.length }, log);
    await new Promise((res) => setTimeout(res, 1500));
  }
  for (const { status, items } of results) {
    if (status !== 200) searchFailed++;
    for (const it of items) {
      const c = classify(it.title);
      if (!c.line && !customUrls.has(it.url)) continue; // 只留追蹤中的產品
      if (/非賣品|贈品|請勿下單|兌換|0元加購/.test(it.title) || it.price >= 9999) continue; // 贈品、佔位商品
      const prev = found.get(it.url);
      if (!prev || it.price < prev.price) found.set(it.url, it);
    }
  }
  const items = Array.from(found.values());
  if (!items.length) return { biggo_found: 0, biggo_queries: queries.length, biggo_skipped: skipped, biggo_search_failed: searchFailed, biggo_status: statuses };

  // 新商品加入、既有商品更新標題與規格（不會動到手動停用的設定）
  const rows = items.map((i) => {
    const c = classify(i.title);
    const cl = customLine.get(i.url);
    const keep = cl && (isUserKey(cl) || !c.line); // 自建產品一律保留；舊的「自訂」若現在對得上內建產品就歸過去
    return { platform: i.platform, url: i.url, title: i.title, brand: keep ? undefined : c.brand, line: keep ? cl : c.line, spec: c.spec, image_url: i.image ?? null };
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
  return { biggo_found: snaps.length, biggo_queries: queries.length, biggo_skipped: skipped, biggo_search_failed: searchFailed, biggo_status: statuses };
}
