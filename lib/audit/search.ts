// 搜尋結果：品牌字搜尋（官網排第幾、誰在說這個品牌）與選購推薦問題（品牌有沒有出現）
import { ddg, kindOf, mentionsBrand, hostOf, BEAUTY_BRANDS, type Hit } from './common';

export type Query = { q: string; type: 'brand' | 'recommend'; status: number; hits: (Hit & { kind: string; brand: boolean })[] };

export function recommendQueries(category: string) {
  const c = category.trim();
  if (!c) return [] as string[];
  return [`${c} 推薦`, `台灣 ${c} 推薦 品牌`, `${c} 比較 評價`];
}

export async function auditSearch(brand: string, aliases: string[], url: string, category: string) {
  const official = hostOf(url);
  const qs: { q: string; type: Query['type'] }[] = [
    { q: brand, type: 'brand' }, { q: `${aliases[0] ?? brand} 評價`, type: 'brand' },
    ...recommendQueries(category).map((q) => ({ q, type: 'recommend' as const })),
  ];
  const results: Query[] = await Promise.all(qs.map(async ({ q, type }, i) => {
    await new Promise((ok) => setTimeout(ok, i * 400));
    const r = await ddg(q);
    return { q, type, status: r.status, hits: r.hits.slice(0, 10).map((h) => ({ ...h, kind: kindOf(h.host, official), brand: mentionsBrand(`${h.title} ${h.snippet} ${h.url}`, aliases) })) };
  }));
  // 推薦情境中出現的其他品牌
  const others: Record<string, number> = {};
  for (const r of results.filter((x) => x.type === 'recommend')) for (const h of r.hits) {
    const t = `${h.title} ${h.snippet}`.toLowerCase();
    for (const b of BEAUTY_BRANDS) if (t.includes(b.toLowerCase()) && !mentionsBrand(b, aliases)) others[b] = (others[b] || 0) + 1;
  }
  return { official, queries: results, competitors: Object.entries(others).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, n]) => ({ name, n })) };
}
export type SearchResult = Awaited<ReturnType<typeof auditSearch>>;
