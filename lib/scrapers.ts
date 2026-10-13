// 各平台抓取程式。每個函式回傳同一種結果格式。
export type Promo = { text: string; period?: string };
export type ScrapeResult = {
  status: 'ok' | 'blocked' | 'not_found' | 'error';
  title?: string;
  list_price?: number | null;
  sale_price?: number | null;
  final_price?: number | null;
  promos?: Promo[];
  in_stock?: boolean | null;
  error?: string;
};

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';

async function get(url: string, extra: Record<string, string> = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'zh-TW,zh;q=0.9', Accept: 'text/html,application/json,*/*', ...extra },
      redirect: 'follow',
      signal: ctrl.signal,
      cache: 'no-store',
    });
    return { status: r.status, text: await r.text() };
  } finally {
    clearTimeout(timer);
  }
}

const num = (s?: string | null) => (s ? parseInt(s.replace(/[^\d]/g, ''), 10) || null : null);

function decode(s: string) {
  return s
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d));
}

export function htmlToText(html: string) {
  return decode(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, '\n')
      .replace(/<style[\s\S]*?<\/style>/gi, '\n')
      .replace(/<[^>]+>/g, '\n'),
  )
    .split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
}

function meta(html: string, prop: string) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`, 'i');
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, 'i');
  return decode((html.match(re) || html.match(re2) || [])[1] || '') || null;
}

function looksBlocked(status: number, text: string) {
  return status === 403 || status === 429 || /captcha|access denied|verify you are human|驗證您是否為真人/i.test(text.slice(0, 5000));
}

// ---------- momo ----------
export function momoUrl(iCode: string) {
  return `https://www.momoshop.com.tw/goods/GoodsDetail.jsp?i_code=${iCode}`;
}

export async function scrapeMomo(url: string): Promise<ScrapeResult> {
  const code = url.match(/i_code=(\d+)/)?.[1] || url.match(/product\/(\d+)/)?.[1];
  if (!code) return { status: 'error', error: '網址中找不到 momo 品號' };
  const { status, text: html } = await get(momoUrl(code));
  if (looksBlocked(status, html)) return { status: 'blocked', error: `HTTP ${status}` };
  if (status === 404) return { status: 'not_found' };
  const text = htmlToText(html);
  const title = (meta(html, 'og:title') || html.match(/<title>([^<]*)<\/title>/i)?.[1] || '').replace(/\s*-\s*momo購物網.*$/, '').trim();
  if (!title || /商品已下架|查無此商品/.test(text)) return { status: 'not_found', title };

  const after = (label: string) => num(text.match(new RegExp(`${label}\\s*\\n?\\s*\\$?\\s*\\n?\\s*([\\d,]+)`))?.[1]);
  const list_price = after('市售價');
  const sale_price = after('促銷價');
  const limited = after('限時折後價');
  const metaPrice = num(meta(html, 'product:price:amount'));
  const final_price = limited ?? metaPrice ?? sale_price;

  // 促銷：「10/13~10/18」日期後面接的活動文字，加上「滿…折 / 送…」等字句
  const promos: Promo[] = [];
  const seen = new Set<string>();
  const lines = text.split('\n');
  lines.forEach((l, i) => {
    const m = l.match(/^(\d{2}\/\d{2}\s*~\s*\d{2}\/\d{2})(.*)$/);
    if (m) {
      const body = (m[2].trim() || lines[i + 1] || '').trim();
      const key = m[1] + body;
      if (body && !seen.has(key) && body.length < 60) { seen.add(key); promos.push({ period: m[1].replace(/\s/g, ''), text: body }); }
    }
  });
  for (const l of lines) {
    if (promos.length >= 8) break;
    if (/^(滿[\d,]+(件|元).*(折|送)|.*買\d送\d|.*最高折[\d,]+元|.*回饋.*%)/.test(l) && l.length < 50 && !promos.some((p) => p.text.includes(l) || l.includes(p.text))) {
      promos.push({ text: l });
    }
  }
  const in_stock = !/已售完|補貨中|銷售一空/.test(text.slice(0, 20000));
  return { status: 'ok', title, list_price, sale_price, final_price, promos, in_stock };
}

// ---------- 通用（品牌官網 / 酷澎）：JSON-LD、meta 價格 ----------
function jsonLdProduct(html: string): any | null {
  const blocks = html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const b of blocks) {
    try {
      const data = JSON.parse(b.replace(/<[^>]+>/g, '').trim());
      const arr = Array.isArray(data) ? data : data['@graph'] || [data];
      const p = arr.find((x: any) => /Product/i.test(String(x['@type'])));
      if (p) return p;
    } catch {}
  }
  return null;
}

export async function scrapeGeneric(url: string): Promise<ScrapeResult> {
  const { status, text: html } = await get(url);
  if (looksBlocked(status, html)) return { status: 'blocked', error: `HTTP ${status}` };
  if (status === 404) return { status: 'not_found' };
  if (status >= 400) return { status: 'error', error: `HTTP ${status}` };
  const p = jsonLdProduct(html);
  const offer = p ? (Array.isArray(p.offers) ? p.offers[0] : p.offers) : null;
  const price =
    num(String(offer?.price ?? offer?.lowPrice ?? '')) ??
    num(meta(html, 'product:price:amount')) ??
    num(meta(html, 'og:price:amount')) ??
    num(html.match(/itemprop=["']price["'][^>]*content=["']([\d.,]+)/i)?.[1]);
  const title = p?.name || meta(html, 'og:title') || html.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim();
  if (!price) return { status: 'error', title, error: '頁面上找不到價格（可能需要 JavaScript 才會顯示）' };
  const text = htmlToText(html);
  const promos: Promo[] = [];
  for (const l of text.split('\n')) {
    if (promos.length >= 6) break;
    if (/(滿[\d,]+.*(折|送)|買\d送\d|限時|優惠價|折價券|免運)/.test(l) && l.length < 50) promos.push({ text: l });
  }
  const avail = String(offer?.availability || '');
  return {
    status: 'ok', title, final_price: price, sale_price: price,
    list_price: num(meta(html, 'product:original_price:amount')),
    promos, in_stock: avail ? /InStock/i.test(avail) : null,
  };
}

// ---------- 蝦皮 ----------
export async function scrapeShopee(url: string): Promise<ScrapeResult> {
  const m = url.match(/-i\.(\d+)\.(\d+)/) || url.match(/product\/(\d+)\/(\d+)/);
  if (!m) return { status: 'error', error: '蝦皮網址格式無法辨識（需為 …-i.店號.商品號）' };
  const [, shopid, itemid] = m;
  const { status, text } = await get(`https://shopee.tw/api/v4/item/get?itemid=${itemid}&shopid=${shopid}`, {
    Referer: url, 'X-Requested-With': 'XMLHttpRequest', 'X-API-SOURCE': 'pc',
  });
  let j: any = null;
  try { j = JSON.parse(text); } catch {}
  const d = j?.data;
  if (!d || status >= 400 || j?.error) return { status: 'blocked', error: `HTTP ${status} ${j?.error ?? ''}`.trim() };
  const p = (v: number | undefined) => (v ? Math.round(v / 100000) : null);
  return {
    status: 'ok', title: d.name,
    list_price: p(d.price_before_discount) || p(d.price_max_before_discount),
    sale_price: p(d.price), final_price: p(d.price_min) ?? p(d.price),
    promos: (d.discount ? [{ text: `折扣 ${d.discount}` }] : []),
    in_stock: (d.stock ?? 1) > 0,
  };
}

export async function scrape(platform: string, url: string): Promise<ScrapeResult> {
  try {
    if (platform === 'momo') return await scrapeMomo(url);
    if (platform === 'shopee') return await scrapeShopee(url);
    return await scrapeGeneric(url); // official, coupang
  } catch (e: any) {
    return { status: 'error', error: String(e?.message || e).slice(0, 300) };
  }
}

export function detectPlatform(url: string): string {
  if (/momoshop\.com\.tw/.test(url)) return 'momo';
  if (/shopee\.tw/.test(url)) return 'shopee';
  if (/coupang\.com/.test(url)) return 'coupang';
  return 'official';
}
