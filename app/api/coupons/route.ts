import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/db';
import { runCoupons } from '@/lib/coupons';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const authed = (req: NextRequest, key?: string) => {
  const auth = req.headers.get('authorization');
  return (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) || (process.env.ADMIN_KEY && key === process.env.ADMIN_KEY);
};

// 每小時更新一次（Supabase 排程呼叫），也可帶 ?key= 手動執行
export async function GET(req: NextRequest) {
  if (!authed(req, req.nextUrl.searchParams.get('key') ?? undefined)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const stats = await runCoupons();
  await adminDb().from('ec_debug').insert({ url: 'coupon-run', status: 200, body: JSON.stringify(stats) });
  return NextResponse.json(stats);
}

// 手動新增／刪除券（賣場券、帳號專屬券）
export async function POST(req: NextRequest) {
  const b = await req.json();
  if (!authed(req, b.key)) return NextResponse.json({ error: '管理密碼錯誤' }, { status: 401 });
  const db = adminDb();
  if (b.action === 'delete') {
    if (!String(b.id || '').startsWith('manual-')) return NextResponse.json({ error: '只能刪除手動新增的券' }, { status: 400 });
    await db.from('ec_coupons').delete().eq('id', b.id);
    return NextResponse.json({ ok: true });
  }
  const platform = ['momo', 'shopee', 'coupang'].includes(b.platform) ? b.platform : null;
  if (!platform) return NextResponse.json({ error: '請選擇平台' }, { status: 400 });
  const n = (v: unknown) => (v === '' || v == null ? null : Math.round(Number(v)));
  const amount = b.type === 'amount' ? n(b.value) : null;
  const rateRaw = b.type === 'rate' ? Number(b.value) : null;
  const rate = rateRaw ? (rateRaw >= 10 ? rateRaw / 100 : rateRaw / 10) : null;
  if (!amount && !rate) return NextResponse.json({ error: '請填寫折抵金額或折數' }, { status: 400 });
  const day = /^\d{4}-\d{2}-\d{2}$/;
  const row = {
    id: 'manual-' + Date.now().toString(36), platform, source: 'manual', kind: b.kind === 'shop' ? 'shop' : 'platform',
    title: String(b.title || '').trim().slice(0, 80) || (b.kind === 'shop' ? '賣場券' : '平台券'),
    scope: b.product ? 'product' : 'all', product_key: b.product || null,
    min_spend: n(b.min) ?? 0, amount, rate, cap: n(b.cap),
    start_date: day.test(b.start || '') ? b.start : null, end_date: day.test(b.end || '') ? b.end : null,
    note: String(b.note || '').slice(0, 120) || null, active: true,
  };
  const { error } = await db.from('ec_coupons').insert(row);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: row.id });
}
