// 透過 BigGo 比價網取得蝦皮商城、酷澎的商品與價格（兩個平台本身會阻擋伺服器連線）
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';

export const BIGGO_STORES: Record<string, string> = {
  tw_mall_shopeemall: 'shopee',
  tw_pec_coupang: 'coupang',
};

import { PRODUCTS } from './classify';
// 每天用這些關鍵字搜尋（自行搜尋加入的關鍵字另外存在 ec_watch_queries）
export const BIGGO_QUERIES = PRODUCTS.flatMap((p) => p.queries);

// 搜尋頁會顯示所有商店；每日追蹤只存蝦皮商城、酷澎（momo 直接抓商品頁）
const STORE_PLATFORM: Record<string, string> = { ...BIGGO_STORES, tw_ec_pchome24h: 'pchome' };

export type BiggoItem = { store: string; storeName: string; platform: string; title: string; url: string; price: number; spec?: string; promos: { text: string }[]; image?: string | null };

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

export function parseBiggo(html: string, allStores = false): BiggoItem[] {
  const out: BiggoItem[] = [];
  const cards = html.split(/ProductItemListPC_product-item-list-PC/).slice(1);
  for (const c of cards) {
    const store = c.match(/\/r\/\?i=([a-z0-9_]+)/)?.[1];
    if (!store) continue;
    const platform = allStores ? STORE_PLATFORM[store] || 'other' : BIGGO_STORES[store];
    if (!platform) continue;
    const storeName = decode(c.match(/StoreName_store[^>]*>(?:[\s\S]*?)<span>([^<]+)<\/span>/)?.[1] || store);
    const title = decode(c.match(/title="([^"]+)"/)?.[1] || '');
    const purlRaw = c.match(/purl=([^&"]+)/)?.[1];
    if (!title || !purlRaw) continue;
    const purl = decodeURIComponent(decode(purlRaw));
    const specLabel = c.match(/MultipleSpec_spec[^"]*">([^<]+)</)?.[1]?.trim();
    const specPrice = num(c.match(/MultipleSpec_price[^"]*">([^<]+)</)?.[1]);
    const main = c.match(/product-price[^"]*"[^>]*>([^<]+)</)?.[1] || '';
    const price = specPrice ?? (/~/.test(main) ? null : num(main));
    if (!price) continue;
    // 活動：卡片上的折扣標籤、價格變動，以及標題裡的優惠字樣
    const promos: { text: string }[] = [];
    const add = (t: string) => { t = t.trim(); if (t && !promos.some((p) => p.text === t)) promos.push({ text: t }); };
    const texts = Array.from(c.matchAll(/>([^<>]{2,30})</g)).map((m) => decode(m[1]));
    for (const t of texts) {
      if (/^(滿\$?[\d,]+折\$?[\d,]+|折扣\$?[\d,]+|最高折\$?[\d,]+|\d+折|免運.*)$/.test(t.trim())) add(t);
      const ch = t.match(/^(降價|漲價)\s*\$?([\d,]+)$/);
      if (ch && ch[1] === '降價') add(`近期降價 $${ch[2]}`); // 漲價不算活動
    }
    for (const m of Array.from(title.matchAll(/買\d+送\d+|\d+入特惠組?|特惠組|限定包裝|限量版?|免運/g))) add(m[0]);
    const image = c.match(/ProductImage[\s\S]*?<img[^>]*src="(https:\/\/[^"]+)"/)?.[1] || null;
    out.push({ store, storeName, image: image && decode(image), platform, title: specLabel ? `${title}（${specLabel}）` : title, url: canonicalUrl(platform, purl), price, spec: specLabel, promos: promos.slice(0, 4) });
  }
  return out;
}

export async function searchBiggo(q: string, allStores = false): Promise<{ status: number; items: BiggoItem[] }> {
  const r = await fetch(`https://biggo.com.tw/s/${encodeURIComponent(q)}/`, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'zh-TW,zh;q=0.9', Accept: 'text/html' },
    cache: 'no-store',
  });
  const html = await r.text();
  return { status: r.status, items: r.ok ? parseBiggo(html, allStores) : [] };
}
