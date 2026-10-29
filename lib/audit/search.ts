// 搜尋結果：品牌字搜尋（官網排第幾、誰在說這個品牌）與選購推薦問題（品牌有沒有出現）
import { ddg, kindOf, mentionsBrand, hostOf, brandsIn, type Hit } from './common';

export type Query = { q: string; type: 'brand' | 'recommend'; status: number; hits: (Hit & { kind: string; brand: boolean })[] };

export function recommendQueries(category: string) {
  const c = category.trim();
  if (!c) return [] as string[];
  return [`${c} 推薦`, `台灣 ${c} 推薦 品牌`, `${c} 比較 評價`];
}

export async function auditSearch(brand: string, aliases: string[], url: string, category: string, prev?: { queries?: Query[] }) {
  const official = hostOf(url);
  const qs: { q: string; type: Query['type'] }[] = [
    { q: brand, type: 'brand' }, { q: `${aliases[0] ?? brand} 評價`, type: 'brand' },
    ...recommendQueries(category).map((q) => ({ q, type: 'recommend' as const })),
  ];
  const deadline = Date.now() + 48000;
  const results: Query[] = [];
  // 依序查；上次已經查到的沿用，只補查失敗的
  for (const { q, type } of qs) {
    const old = prev?.queries?.find((x) => x.q === q && x.status === 200);
    if (old) { results.push(old); continue; }
    if (Date.now() > deadline - 6000) { results.push({ q, type, status: 0, hits: [] }); continue; }
    const r = await ddg(q, { deadline });
    results.push({ q, type, status: r.status, hits: r.hits.slice(0, 10).map((h) => ({ ...h, kind: kindOf(h.host, official), brand: mentionsBrand(`${h.title} ${h.snippet} ${h.url}`, aliases) })) });
  }
  // 推薦情境中出現的其他品牌
  const others: Record<string, number> = {};
  for (const r of results.filter((x) => x.type === 'recommend')) for (const h of r.hits) {
    for (const b of brandsIn(`${h.title} ${h.snippet}`, aliases)) others[b] = (others[b] || 0) + 1;
  }
  return { official, queries: results, competitors: Object.entries(others).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, n]) => ({ name, n })) };
}
export type SearchResult = Awaited<ReturnType<typeof auditSearch>>;
