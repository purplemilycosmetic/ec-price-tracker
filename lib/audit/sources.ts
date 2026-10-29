// AI 常引用的來源：打開「選購推薦」搜尋排名前面的文章，看內文有沒有提到品牌、提到哪些競品
import { get, mentionsBrand, brandsIn } from './common';
import type { SearchResult } from './search';

export async function auditSources(search: SearchResult | undefined, aliases: string[]) {
  const seen = new Set<string>();
  const picks: { url: string; title: string; host: string; q: string }[] = [];
  for (const q of (search?.queries ?? []).filter((x) => x.type === 'recommend')) {
    for (const h of q.hits.filter((x) => x.kind === 'media' || x.kind === 'social').slice(0, 3)) {
      if (seen.has(h.url) || picks.length >= 6) continue;
      seen.add(h.url); picks.push({ url: h.url, title: h.title, host: h.host, q: q.q });
    }
  }
  const t0 = Date.now();
  const articles = await Promise.all(picks.map(async (p, i) => {
    await new Promise((ok) => setTimeout(ok, i * 500));
    if (Date.now() - t0 > 40000) return { ...p, ok: false, mentioned: false, brands: [] as string[] };
    const r = await get('https://r.jina.ai/' + p.url, 25000);
    const text = r.status === 200 ? r.text.split(/Markdown Content:/)[1] ?? r.text : '';
    return { ...p, ok: r.status === 200 && text.length > 500, mentioned: mentionsBrand(text, aliases), brands: brandsIn(text, aliases).slice(0, 12) };
  }));
  return { articles };
}
export type SourcesResult = Awaited<ReturnType<typeof auditSources>>;
