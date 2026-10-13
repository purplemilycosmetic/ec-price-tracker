import { NextRequest, NextResponse } from 'next/server';
import { runUpdate } from '@/lib/update';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Vercel Cron 每日呼叫；也可帶 ?key=ADMIN_KEY 手動執行
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  const key = req.nextUrl.searchParams.get('key');
  const okCron = process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
  const okKey = process.env.ADMIN_KEY && key === process.env.ADMIN_KEY;
  if (!okCron && !okKey) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const summary = await runUpdate();
  return NextResponse.json(summary);
}
