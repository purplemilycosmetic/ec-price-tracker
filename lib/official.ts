// 品牌官網：取得正式品名、官方圖片，以及官網列出的授權購買通路
// （雅漾、AHC 台灣官網都不直接販售，所以沒有價格）
import { PRODUCTS, type Product } from './classify';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
const decode = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

export type OfficialInfo = {
  key: string; official_name: string | null; official_url: string; image_url: string | null;
  channels: { name: string; url: string }[];
};

const CHANNELS: [RegExp, string][] = [
  [/momoshop\.com\.tw/, 'momo'], [/shopee\.tw/, '蝦皮'], [/coupang\.com/, '酷澎'], [/pchome\.com\.tw/, 'PChome'],
  [/watsons\.com\.tw/, '屈臣氏'], [/cosmed\.com\.tw/, '康是美'], [/poyabuy\.com\.tw/, '寶雅'], [/costco\.com\.tw/, '好市多'],
];

async function get(url: string) {
  const r = await fetch(encodeURI(decodeURI(url)), { headers: { 'User-Agent': UA, 'Accept-Language': 'zh-TW' }, cache: 'no-store' });
  return { ok: r.ok, text: await r.text() };
}

export async function fetchOfficial(p: Product): Promise<OfficialInfo | null> {
  if (!p.official) return null;
  const { ok, text: html } = await get(p.official.url);
  if (!ok) return null;
  let name: string | null = null, image: string | null = null;
  // 雅漾：頁面有 schema.org Product
  for (const b of html.match(/<script[^>]+ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || []) {
    try {
      const d = JSON.parse(b.replace(/<[^>]+>/g, ''));
      if (/Product/.test(String(d['@type']))) { name = d.name; image = Array.isArray(d.image) ? d.image[0] : d.image; }
    } catch {}
  }
  // AHC（Shopify）：用 og 標籤
  name ||= decode(html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/)?.[1] || '') || null;
  const og = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/)?.[1];
  if (!image && og && !/no-image/.test(og)) image = decode(og).replace(/^\/\//, 'https://');
  if (p.official.imageHint) {
    const imgs = Array.from(html.matchAll(/((?:https?:)?\/\/[^"' )]+\.(?:png|jpg|jpeg|webp))/gi)).map((m) => m[1]);
    const hit = imgs.find((u) => p.official!.imageHint!.test(u));
    if (hit) image = hit.replace(/^\/\//, 'https://');
  }
  if (p.official.kind === 'ahc' && !image) {
    // Shopify 商品資料：正式品名與主圖
    try {
      const j = JSON.parse((await get(p.official.url + '.js')).text);
      name = j.title || name;
      const f = j.featured_image || j.images?.[0];
      if (f) image = String(f).replace(/^\/\//, 'https://');
    } catch {}
  }
  const channels: { name: string; url: string }[] = [];
  for (const m of Array.from(html.matchAll(/href="(https?:\/\/[^"]+)"/g))) {
    const url = decode(m[1]);
    const hit = CHANNELS.find(([re]) => re.test(url));
    if (hit && !channels.some((c) => c.name === hit[1]) && !/\/(search|category|brand)/i.test(url)) channels.push({ name: hit[1], url });
  }
  return { key: p.key, official_name: name?.replace(/\s*[|｜–-]\s*(AHC|Avène|雅漾).*$/i, '').trim() || null, official_url: p.official.url, image_url: image, channels };
}

export async function fetchAllOfficial() {
  const out: OfficialInfo[] = [];
  for (const p of PRODUCTS) {
    try { const o = await fetchOfficial(p); if (o) out.push(o); } catch {}
  }
  return out;
}
