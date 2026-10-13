import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 管理用：從 Vercel 主機測試某個網址能否讀取（需 ADMIN_KEY）
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  if (!process.env.ADMIN_KEY || p.get('key') !== process.env.ADMIN_KEY)
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const url = p.get('url')!;
  const find = p.get('find');
  const n = +(p.get('n') || 1500);
  const mobile = p.get('ua') === 'mobile';
  const headers: Record<string, string> = {
    'User-Agent': mobile
      ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
      : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
    'Accept-Language': 'zh-TW,zh;q=0.9',
    Accept: p.get('accept') || 'text/html,application/json,*/*',
  };
  if (p.get('ref')) headers.Referer = p.get('ref')!;
  const body = p.get('body');
  if (body) headers['Content-Type'] = 'application/json';
  try {
    const r = await fetch(url, { method: body ? 'POST' : 'GET', headers, body: body || undefined, cache: 'no-store' });
    const t = await r.text();
    const hits: string[] = [];
    if (find) {
      const re = new RegExp(find, 'g'); let m;
      while ((m = re.exec(t)) && hits.length < 30) hits.push(t.slice(Math.max(0, m.index - 120), m.index + 200));
    }
    return NextResponse.json({ status: r.status, finalUrl: r.url, len: t.length, server: r.headers.get('server'), hits, head: t.slice(0, n) });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) });
  }
}
