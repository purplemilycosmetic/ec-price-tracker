import { NextRequest } from 'next/server';
import { parseQuery, loadHistory } from '@/lib/history';
import { productOf } from '@/lib/classify';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const NAMES: Record<string, string> = { momo: 'momo', shopee: '蝦皮商城', coupang: '酷澎', pchome: 'PChome' };
const cell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// 匯出指定期間的每日價格（每個商品頁一列一天），Excel 可直接開啟
export async function GET(req: NextRequest) {
  const q = parseQuery(Object.fromEntries(req.nextUrl.searchParams));
  const h = await loadHistory(q);
  const byId = new Map(h.listings.map((l) => [l.id, l]));
  const lines = [['日期', '平台', '規格', '折後價', '原價', '活動', '商品標題', '網址'].join(',')];
  for (const s of h.snaps) {
    const l = byId.get(s.listing_id);
    if (!l || s.final_price == null) continue;
    lines.push([
      s.captured_on, NAMES[l.platform] ?? l.platform, l.spec ?? '', s.final_price, s.list_price ?? '',
      (s.promos || []).map((p) => (p.period ? `${p.text}（${p.period}）` : p.text)).join('；'), l.title ?? '', l.url,
    ].map(cell).join(','));
  }
  const name = `${productOf(q.product)?.short ?? '自訂追蹤'}_${q.from}_${q.to}.csv`;
  // 加 BOM，Excel 開中文才不會亂碼
  return new Response('﻿' + lines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
    },
  });
}
