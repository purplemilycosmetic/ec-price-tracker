// 平台大型活動：從 Google 新聞 RSS 找近期的購物節、優惠新聞
export const NEWS_QUERIES: Record<string, string[]> = {
  momo: ['momo購物網 優惠活動', 'momo 購物節'],
  shopee: ['蝦皮 優惠活動', '蝦皮 購物節'],
  coupang: ['酷澎 優惠活動', '酷澎 Coupang 優惠'],
};

const NAME: Record<string, RegExp> = { momo: /momo|富邦媒/i, shopee: /蝦皮|shopee/i, coupang: /酷澎|coupang/i };
const PUNCT = /[\s!-\/:-@\[-`{-~，。！？、：；「」『』（）【】…—‧·｜★☆]/g;
const NOISE = /當機|回應|詐騙|查核|假冒|簡訊|釣魚|客訴|裁員|罰|股價|營收/;
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
