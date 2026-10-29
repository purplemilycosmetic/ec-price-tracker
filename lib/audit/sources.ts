// AI 常引用的來源：打開「選購推薦」搜尋排名前面的文章，看內文有沒有提到品牌、提到哪些競品
import { get, mentionsBrand, brandsIn } from './common';
import type { SearchResult } from './search';

// 只留文章主體：去掉連結清單、導覽列、頁尾（多數由一行一個連結組成）
function articleBody(md: string) {
  const lines = md.split('\n');
  const keep = lines.filter((l) => {
    const t = l.trim();
    if (!t) return false;
    const links = (t.match(/\]\(https?:/g) || []).length;
    const plain = t.replace(/!?\[[^\]]*\]\([^)]*\)/g, '').replace(/[*#>\-|\s]/g, '');
    return !(links >= 1 && plain.length < 15); // 幾乎只有連結的行（選單、相關文章、廣告）
  });
  // 頁尾常見字樣之後的內容不算
  const body = keep.join('\n');
  const cut = body.search(/延伸閱讀|相關文章|熱門文章|你可能也喜歡|推薦閱讀|More from|Related|版權所有|Copyright/);
  return cut > 800 ? body.slice(0, cut) : body;
}

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
    if (Date.now() - t0 > 40000) return { ...p, ok: false, mentioned: false, hits: 0, context: null as string | null, brands: [] as string[] };
    const r = await get('https://r.jina.ai/' + p.url, 25000);
    const raw = r.status === 200 ? r.text.split(/Markdown Content:/)[1] ?? r.text : '';
    const text = articleBody(raw);
    // 出現次數與上下文，避免把側欄、廣告、相關文章清單裡的品牌名算進去
    const lines = text.split('\n').filter((l) => mentionsBrand(l, aliases));
    const context = lines[0] ? lines[0].replace(/[#*>\[\]()!]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) : null;
    return { ...p, ok: r.status === 200 && text.length > 500, mentioned: lines.length > 0, hits: lines.length, context, brands: brandsIn(text, aliases).slice(0, 12) };
  }));
  return { articles };
}
export type SourcesResult = Awaited<ReturnType<typeof auditSources>>;
