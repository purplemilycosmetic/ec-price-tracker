import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/db';
import { detectPlatform } from '@/lib/scrapers';
import { runUpdate } from '@/lib/update';
import { classify, CUSTOM } from '@/lib/classify';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 新增 / 停用追蹤網址（需 ADMIN_KEY）
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!process.env.ADMIN_KEY || body.key !== process.env.ADMIN_KEY)
    return NextResponse.json({ error: '管理密碼錯誤' }, { status: 401 });
  const db = adminDb();
  if (body.action === 'deactivate') {
    await db.from('ec_listings').update({ active: false }).eq('id', body.id);
    return NextResponse.json({ ok: true });
  }
  const urls: string[] = String(body.urls || '').split(/\s+/).filter((u) => /^https?:\/\//.test(u));
  if (!urls.length) return NextResponse.json({ error: '請貼上至少一個網址' }, { status: 400 });
  // 標題能對到追蹤中的產品就歸到該產品，否則列在「自訂追蹤」
  const c = body.title ? classify(body.title) : null;
  const line = body.line || c?.line || (body.title ? CUSTOM : null); // 沒標題時先留空，抓到標題後自動判斷
  // 加入的商品所屬產品若被停止追蹤過，自動恢復顯示
  if (line) await db.from('ec_hidden_products').delete().eq('key', line);
  const rows = urls.map((url) => ({
    url, platform: detectPlatform(url), active: true, line, brand: c?.brand ?? null,
    ...(body.title ? { title: body.title, spec: c?.spec ?? null, image_url: body.image || null } : {}),
  }));
  // 蝦皮、酷澎靠搜尋關鍵字每天更新，記下這次的關鍵字
  if (body.query && rows.some((r) => r.platform === 'shopee' || r.platform === 'coupang'))
    await db.from('ec_watch_queries').upsert({ query: String(body.query).slice(0, 60) }, { onConflict: 'query' });
  // 從搜尋頁加入時，順便記下當下價格當作第一筆紀錄
  if (body.price && body.title) {
    const { todayTaipei } = await import('@/lib/db');
    const { data: saved } = await db.from('ec_listings').upsert(rows, { onConflict: 'url' }).select('id');
    if (saved?.[0]) await db.from('ec_price_snapshots').upsert(
      { listing_id: saved[0].id, captured_on: todayTaipei(), status: 'ok', final_price: body.price, sale_price: body.price, promos: [], in_stock: true, error: '來源：搜尋加入' },
      { onConflict: 'listing_id,captured_on' });
    if (rows[0].platform !== 'momo') return NextResponse.json({ added: 1, line });
  }
  const { data, error } = await db.from('ec_listings').upsert(rows, { onConflict: 'url' }).select('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const summary = await runUpdate(data!.map((d) => d.id));
  return NextResponse.json({ added: data!.length, summary, line });
}
