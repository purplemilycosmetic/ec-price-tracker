import { NextRequest, NextResponse } from 'next/server';
import { runForum } from '@/lib/forum';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 每日抓取論壇新文章（Vercel Cron 或 ?key=ADMIN_KEY 手動）
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  const key = req.nextUrl.searchParams.get('key');
  const okCron = process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
  const okKey = process.env.ADMIN_KEY && key === process.env.ADMIN_KEY;
  if (!okCron && !okKey) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json(await runForum());
}
