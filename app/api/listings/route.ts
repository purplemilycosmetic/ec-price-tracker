import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/db';
import { detectPlatform } from '@/lib/scrapers';
import { runUpdate } from '@/lib/update';

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
  const rows = urls.map((url) => ({ url, platform: detectPlatform(url), active: true, brand: body.brand || null, line: body.line || null }));
  const { data, error } = await db.from('ec_listings').upsert(rows, { onConflict: 'url' }).select('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const summary = await runUpdate(data!.map((d) => d.id));
  return NextResponse.json({ added: data!.length, summary });
}
