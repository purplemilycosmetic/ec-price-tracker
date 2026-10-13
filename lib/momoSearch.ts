// momo 搜尋頁：頁面內含 schema.org ItemList（品名、圖片、價格、網址）
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';

export type MomoHit = { title: string; url: string; price: number; image: string | null; code: string };

export async function searchMomo(q: string): Promise<{ status: number; items: MomoHit[] }> {
  const r = await fetch(`https://www.momoshop.com.tw/search/searchShop.jsp?keyword=${encodeURIComponent(q)}`, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'zh-TW,zh;q=0.9', Accept: 'text/html' },
    cache: 'no-store',
  });
  const html = await r.text();
  const items: MomoHit[] = [];
  for (const b of html.match(/<script[^>]+ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || []) {
    let d: any;
    try { d = JSON.parse(b.replace(/^<script[^>]*>|<\/script>$/gi, '')); } catch { continue; }
    const list = (Array.isArray(d) ? d : [d]).find((x) => /ItemList/.test(String(x?.['@type'])));
    for (const el of list?.itemListElement || []) {
      const it = el.item || el;
      const code = String(it.url || '').match(/i_code=(\d+)/)?.[1];
      const price = Number(it.offers?.price ?? it.offers?.lowPrice);
      if (!code || !price || !it.name) continue;
      if (items.some((x) => x.code === code)) continue;
      items.push({
        title: it.name, code, price,
        url: `https://www.momoshop.com.tw/goods/GoodsDetail.jsp?i_code=${code}`,
        image: typeof it.image === 'string' ? it.image : it.image?.[0] ?? null,
      });
    }
  }
  return { status: r.status, items };
}
