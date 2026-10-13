// 透過 BigGo 比價網取得蝦皮商城、酷澎的商品與價格（兩個平台本身會阻擋伺服器連線）
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';

export const BIGGO_STORES: Record<string, string> = {
  tw_mall_shopeemall: 'shopee',
  tw_pec_coupang: 'coupang',
};

// 每天用這些關鍵字搜尋
export const BIGGO_QUERIES = [
  '雅漾 活泉水', 'Avene 活泉水 300ml', 'Avene 活泉水 150ml', 'Avene 活泉水 50ml',
  'AHC 精華', 'AHC 玻尿酸精華', 'AHC B5 精華', 'AHC 原液',
  'OLAY 乳霜', 'OLAY 大紅瓶 乳霜', 'OLAY 超紅瓶 乳霜',
];

export type BiggoItem = { platform: string; title: string; url: string; price: number; spec?: string };

const decode = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const num = (s?: string) => (s ? parseInt(s.replace(/[^\d]/g, ''), 10) || null : null);

function canonicalUrl(platform: string, purl: string) {
  if (platform === 'coupang') {
    // 聯盟連結裡帶有商品編號，轉回一般商品頁網址
    const p = decodeURIComponent(purl);
    const pid = p.match(/pageKey=(\d+)/)?.[1];
    const item = p.match(/itemId=(\d+)/)?.[1];
    const vendor = p.match(/vendorItemId=(\d+)/)?.[1];
    if (pid) return `https://www.tw.coupang.com/products/${pid}${item ? `?itemId=${item}` : ''}${vendor ? `&vendorItemId=${vendor}` : ''}`;
  }
  return purl.split('?')[0];
}

export function parseBiggo(html: string): BiggoItem[] {
  const out: BiggoItem[] = [];
  const cards = html.split(/ProductItemListPC_product-item-list-PC/).slice(1);
  for (const c of cards) {
    const store = c.match(/\/r\/\?i=([a-z0-9_]+)/)?.[1];
    const platform = store && BIGGO_STORES[store];
    if (!platform) continue;
    const title = decode(c.match(/title="([^"]+)"/)?.[1] || '');
    const purlRaw = c.match(/purl=([^&"]+)/)?.[1];
    if (!title || !purlRaw) continue;
    const purl = decodeURIComponent(decode(purlRaw));
    const specLabel = c.match(/MultipleSpec_spec[^"]*">([^<]+)</)?.[1]?.trim();
    const specPrice = num(c.match(/MultipleSpec_price[^"]*">([^<]+)</)?.[1]);
    const main = c.match(/product-price[^"]*"[^>]*>([^<]+)</)?.[1] || '';
    const price = specPrice ?? (/~/.test(main) ? null : num(main));
    if (!price) continue;
    out.push({ platform, title: specLabel ? `${title}（${specLabel}）` : title, url: canonicalUrl(platform, purl), price, spec: specLabel });
  }
  return out;
}

export async function searchBiggo(q: string): Promise<{ status: number; items: BiggoItem[] }> {
  const r = await fetch(`https://biggo.com.tw/s/${encodeURIComponent(q)}/`, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'zh-TW,zh;q=0.9', Accept: 'text/html' },
    cache: 'no-store',
  });
  const html = await r.text();
  return { status: r.status, items: r.ok ? parseBiggo(html) : [] };
}
