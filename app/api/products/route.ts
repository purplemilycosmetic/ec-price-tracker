import { NextRequest, NextResponse } from 'next/server';
import { adminDb, todayTaipei } from '@/lib/db';
import { detectPlatform } from '@/lib/scrapers';
import { runUpdate } from '@/lib/update';
import { classify } from '@/lib/classify';
import { isUserKey } from '@/lib/custom';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Item = { url: string; title: string; price?: number; image?: string | null };

// 建立／停止追蹤「自建產品」：一個產品可同時包含 momo、蝦皮、酷澎的商品頁
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!process.env.ADMIN_KEY || body.key !== process.env.ADMIN_KEY)
    return NextResponse.json({ error: '管理密碼錯誤' }, { status: 401 });
  const db = adminDb();

  if (body.action === 'rename') {
    if (!isUserKey(body.product)) return NextResponse.json({ error: '只能改自建產品的名稱' }, { status: 400 });
    const nm = String(body.name || '').trim().slice(0, 40);
    if (!nm) return NextResponse.json({ error: '名稱不能空白' }, { status: 400 });
    const patch: Record<string, unknown> = { name: nm, short: nm.length > 14 ? nm.slice(0, 14) + '…' : nm };
    if (typeof body.brand === 'string') patch.brand = body.brand.trim().slice(0, 20) || null;
    await db.from('ec_custom_products').update(patch).eq('key', body.product);
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'remove') {
    if (!isUserKey(body.product)) return NextResponse.json({ error: '只能停止自建產品' }, { status: 400 });
    await db.from('ec_custom_products').update({ active: false }).eq('key', body.product);
    await db.from('ec_listings').update({ active: false }).eq('line', body.product);
    return NextResponse.json({ ok: true });
  }

  const name = String(body.name || '').trim().slice(0, 40);
  if (!name) return NextResponse.json({ error: '請輸入產品名稱' }, { status: 400 });
  const items: Item[] = (Array.isArray(body.items) ? body.items : []).filter((i: Item) => /^https?:\/\//.test(i?.url || '')).slice(0, 40);
  const pasted = String(body.urls || '').split(/\s+/).filter((u) => /^https?:\/\//.test(u));
  if (!items.length && !pasted.length) return NextResponse.json({ error: '請至少勾選一個商品或貼上一個網址' }, { status: 400 });

  const pkey = 'u-' + Date.now().toString(36);
  const brand = String(body.brand || '').trim().slice(0, 20) || null;
  const query = String(body.query || name).trim().slice(0, 60);
  const { error: e1 } = await db.from('ec_custom_products').insert({ key: pkey, brand, name, short: name.length > 14 ? name.slice(0, 14) + '…' : name, queries: [query] });
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });

  const seen = new Set<string>();
  const rows = [
    ...items.map((i) => ({ i, url: i.url })),
    ...pasted.map((url) => ({ i: null as Item | null, url })),
  ].filter((r) => !seen.has(r.url) && seen.add(r.url)).map(({ i, url }) => ({
    url, platform: detectPlatform(url), active: true, line: pkey, brand: brand ?? (i ? classify(i.title).brand : null),
    ...(i ? { title: i.title, spec: classify(i.title).spec, image_url: i.image || null } : {}),
  }));
  const { data: saved, error } = await db.from('ec_listings').upsert(rows, { onConflict: 'url' }).select('id,url,platform');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 蝦皮、酷澎：先用搜尋當下的價格當第一筆；之後每天由關鍵字搜尋更新
  const priceOf = new Map(items.map((i) => [i.url, i.price]));
  const snaps = (saved || []).filter((s) => (s.platform === 'shopee' || s.platform === 'coupang') && priceOf.get(s.url))
    .map((s) => ({ listing_id: s.id, captured_on: todayTaipei(), status: 'ok', final_price: priceOf.get(s.url), sale_price: priceOf.get(s.url), promos: [], in_stock: true, error: '來源：搜尋加入' }));
  if (snaps.length) await db.from('ec_price_snapshots').upsert(snaps, { onConflict: 'listing_id,captured_on' });

  const summary = await runUpdate((saved || []).map((s) => s.id)).catch(() => null);
  return NextResponse.json({ product: pkey, added: saved?.length ?? 0, summary });
}
