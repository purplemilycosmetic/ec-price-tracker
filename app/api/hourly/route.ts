import { NextRequest, NextResponse } from 'next/server';
import { adminDb, todayTaipei } from '@/lib/db';
import { runBiggo, runUpdate } from '@/lib/update';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 每小時補抓（由 Supabase 排程呼叫）：今天還沒抓到的蝦皮／酷澎關鍵字、momo 商品頁再抓一次；全部抓到就不做事
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  const key = req.nextUrl.searchParams.get('key');
  const okCron = process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
  const okKey = process.env.ADMIN_KEY && key === process.env.ADMIN_KEY;
  if (!okCron && !okKey) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const db = adminDb();
  const day = todayTaipei();
  // momo／官網：啟用中、今天還沒有成功價格的商品頁
  const [{ data: ls }, { data: okSnaps }] = await Promise.all([
    db.from('ec_listings').select('id').eq('active', true).not('platform', 'in', '(shopee,coupang)'),
    db.from('ec_price_snapshots').select('listing_id').eq('captured_on', day).eq('status', 'ok'),
  ]);
  const done = new Set((okSnaps || []).map((s) => s.listing_id));
  const missing = (ls || []).map((l) => l.id).filter((id) => !done.has(id)).slice(0, 40);

  const [biggo, momo] = await Promise.all([
    runBiggo(day, { onlyPending: true, budgetMs: 38000 }).catch((e) => ({ biggo_error: String(e) })),
    missing.length ? runUpdate(missing).catch((e) => ({ momo_error: String(e) })) : Promise.resolve({ total: 0 }),
  ]);
  const result = { day, momo_missing: missing.length, momo, ...biggo };
  await db.from('ec_debug').insert({ url: 'hourly-run', status: 200, body: JSON.stringify(result) });
  return NextResponse.json(result);
}
