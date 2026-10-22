// 平台大型活動：從 Google 新聞 RSS 找近期的購物節、優惠新聞
export const NEWS_QUERIES: Record<string, string[]> = {
  // 多抓即將到來的大檔期（雙11、雙12、週年慶），舊活動在顯示時會依日期濾掉
  momo: ['momo購物網 優惠活動', 'momo 購物節', 'momo 雙11', 'momo 週年慶'],
  shopee: ['蝦皮 優惠活動', '蝦皮 購物節', '蝦皮 雙11', '蝦皮 商城日'],
  coupang: ['酷澎 優惠活動', '酷澎 Coupang 優惠', '酷澎 雙11'],
};

const NAME: Record<string, RegExp> = { momo: /momo|富邦媒/i, shopee: /蝦皮|shopee/i, coupang: /酷澎|coupang/i };
const PUNCT = /[\s!-\/:-@\[-`{-~，。！？、：；「」『』（）【】…—‧·｜★☆]/g;
const NOISE = /當機|回應|詐騙|查核|假冒|簡訊|釣魚|客訴|裁員|罰|股價|營收|商家|賣家|Ads|廣告主|投放|財報|法說/;
const RELEVANT = /優惠|活動|購物節|折|回饋|免運|券|下殺|狂歡|週年慶|雙1|雙十|11\.11|1111|12\.12|限時/;

export type NewsItem = { platform: string; title: string; url: string; source: string; published_at: string };

const decode = (s: string) =>
  s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

export async function fetchNews(maxAgeDays = 21): Promise<NewsItem[]> {
  const out: NewsItem[] = [];
  const cutoff = Date.now() - maxAgeDays * 86400_000;
  for (const [platform, qs] of Object.entries(NEWS_QUERIES)) {
    for (const q of qs) {
      try {
        const r = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`, { cache: 'no-store' });
        const xml = await r.text();
        for (const item of xml.split('<item>').slice(1)) {
          const rawTitle = decode(item.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '');
          const url = decode(item.match(/<link>([\s\S]*?)<\/link>/)?.[1] || '');
          const date = new Date(item.match(/<pubDate>([^<]+)<\/pubDate>/)?.[1] || 0);
          const source = decode(item.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] || '');
          const title = rawTitle.replace(new RegExp(`\\s*-\\s*${source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), '');
          if (!url || +date < cutoff || !RELEVANT.test(title) || !NAME[platform].test(title)) continue;
          if (NOISE.test(title)) continue;
          // 同一件事常被多家媒體報導：標題前 10 個字相同就算重複
          const key = title.replace(PUNCT, '').slice(0, 10);
          if (out.some((o) => o.platform === platform && o.title.replace(PUNCT, '').slice(0, 10) === key)) continue;
          out.push({ platform, title, url, source, published_at: date.toISOString() });
        }
      } catch {}
    }
  }
  return out;
}

// 顯示前再清一次（舊資料也適用）：排除非活動新聞、同一事件只留最新一則
export function cleanNews<T extends { platform: string; title: string | null }>(items: T[]): T[] {
  const out: T[] = [];
  for (const it of items) {
    const t = it.title || '';
    if (NOISE.test(t)) continue;
    const key = t.replace(PUNCT, '').slice(0, 10);
    if (out.some((o) => o.platform === it.platform && (o.title || '').replace(PUNCT, '').slice(0, 10) === key)) continue;
    out.push(it);
  }
  return out;
}

// 從標題找出活動日期（4.4、9.9、10/25、11月11日、雙11、雙十、雙12；區間取最後一天）
const pad2 = (n: number) => String(n).padStart(2, '0');
export function eventDates(title: string, publishedAt: string): string[] {
  const t = title.normalize('NFKC');
  const pub = new Date(new Date(publishedAt).getTime() + 8 * 3600_000);
  const y = pub.getUTCFullYear(), pm = pub.getUTCMonth() + 1;
  const md: [number, number][] = [];
  const ok = (m: number, d: number) => m >= 1 && m <= 12 && d >= 1 && d <= 31;
  for (const m of Array.from(t.matchAll(/(?<![\d.$])(\d{1,2})\.(\d{1,2})(?![\d.]|\s*(?:折|%|倍|萬|億|元|吋|G|分))/g))) if (ok(+m[1], +m[2])) md.push([+m[1], +m[2]]);
  for (const m of Array.from(t.matchAll(/(?<![\d\/])(\d{1,2})\/(\d{1,2})(?![\d\/])/g))) if (ok(+m[1], +m[2])) md.push([+m[1], +m[2]]);
  for (const m of Array.from(t.matchAll(/(\d{1,2})月(\d{1,2})[日號]/g))) if (ok(+m[1], +m[2])) md.push([+m[1], +m[2]]);
  if (/雙十一|雙11|1111/.test(t)) md.push([11, 11]);
  if (/雙十二|雙12|1212/.test(t)) md.push([12, 12]);
  if (/雙十(?![一二])|雙10(?!\d)|國慶/.test(t)) md.push([10, 10]);
  if (/光棍節/.test(t)) md.push([11, 11]);
  const DAYS: [RegExp, number, number][] = [[/世界糧食日/, 10, 16], [/萬聖/, 10, 31], [/聖誕/, 12, 25], [/跨年/, 12, 31], [/情人節(?!.*七夕)/, 2, 14], [/婦女節/, 3, 8], [/兒童節/, 4, 4], [/父親節/, 8, 8]];
  for (const [re, m, d] of DAYS) if (re.test(t)) md.push([m, d]);
  // 「搶攻雙11前哨戰」「雙11暖身」：雙11 是目標不是這檔活動本身，有其他日期時以其他日期為準
  if (/前哨|暖身|預熱/.test(t) && md.length > 1) {
    const target = md.filter(([m, d]) => m === d && m >= 11).pop();
    if (target) md.splice(md.indexOf(target), 1);
  }
  // 年初的活動在年底發的新聞裡多半是指明年
  return md.map(([m, d]) => `${m <= 3 && pm >= 11 ? y + 1 : y}-${pad2(m)}-${pad2(d)}`);
}

// 活動日期都已經過了 → 舊活動；沒寫日期的一般優惠新聞不算
export function eventStatus(title: string, publishedAt: string, today: string): { past: boolean; on: string | null } {
  const ds = eventDates(title, publishedAt);
  if (!ds.length) return { past: false, on: null };
  const sorted = ds.sort();
  const last = sorted[sorted.length - 1];
  return { past: last < today, on: sorted.find((d) => d >= today) ?? null }; // 標示最近一個還沒過的日期
}
