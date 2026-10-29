import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

// 建立一份品牌健檢（需管理密碼）；實際檢查由 /api/audit/run 分階段執行
export async function POST(req: NextRequest) {
  const b = await req.json();
  if (!process.env.ADMIN_KEY || b.key !== process.env.ADMIN_KEY) return NextResponse.json({ error: '管理密碼錯誤' }, { status: 401 });
  const brand = String(b.brand || '').trim().slice(0, 60);
  let url = String(b.url || '').trim();
  if (!brand || !url) return NextResponse.json({ error: '請填寫品牌名稱與官網' }, { status: 400 });
  if (!/^https?:\/\//.test(url)) url = 'https://' + url;
  try { new URL(url); } catch { return NextResponse.json({ error: '官網網址格式不正確' }, { status: 400 }); }
  const { data, error } = await adminDb().from('ec_brand_audits').insert({
    brand, url, category: String(b.category || '').trim().slice(0, 30) || null, status: 'running',
  }).select('id').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}
