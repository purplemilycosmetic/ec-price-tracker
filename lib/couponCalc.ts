// 券後價計算（伺服器與瀏覽器共用，不碰資料庫）
export type Coupon = {
  id: string; platform: string; source: string; kind: 'platform' | 'shop' | 'bank'; title: string;
  scope: string; scope_text: string | null; product_key: string | null; listing_id: number | null;
  min_spend: number; amount: number | null; rate: number | null; cap: number | null;
  start_date: string | null; end_date: string | null; start_time: string | null;
  limited: boolean; vip: boolean; new_user: boolean; bank: string | null; url: string | null; note: string | null;
  first_seen: string; last_seen: string; active: boolean;
};
export type ListingLite = { id: number; platform: string; line: string | null; title: string | null; brand?: string | null };
export type Applied = { price: number; base: number; used: Coupon[] };

export const SCOPE_NAME: Record<string, string> = {
  all: '全站', mall: '商城', direct: '直營', beauty: '美妝保養', category: '指定分類', brand: '指定品牌',
  designated: '指定商品', product: '指定產品', listing: '指定商品頁',
};

// 這張券在這一天有效嗎？沒有寫到期日的（兌完為止）以來源最後一次還列出它的日期為準
export function activeOn(c: Coupon, day: string) {
  if (!c.active) return false;
  if (c.start_date && day < c.start_date) return false;
  if (c.end_date) return day <= c.end_date;
  if (c.source === 'manual') return day >= (c.start_date || c.first_seen); // 手動輸入、沒寫到期日：一直有效到你刪除
  return day >= c.first_seen && day <= c.last_seen;
}

// 這張券能不能用在這個商品頁（只自動套用一般人都拿得到的券：不含新客、VIP、指定銀行卡）
export function eligible(c: Coupon, l: ListingLite, opts: { includeSpecial?: boolean } = {}) {
  if (c.platform !== l.platform) return false;
  if (!opts.includeSpecial && (c.new_user || c.vip || c.kind === 'bank')) return false;
  const t = (l.title || '').toLowerCase();
  switch (c.scope) {
    case 'all': case 'beauty': return true; // 追蹤的都是美妝保養品
    case 'mall': return l.platform === 'shopee'; // 追蹤的蝦皮商品都來自蝦皮商城
    case 'direct': return /直營|直送|24h/.test(t);
    case 'brand': return !!c.scope_text && c.scope_text.split(/[\/、,，\s]+/).filter(Boolean).some((b) => t.includes(b.toLowerCase()) || (l.brand || '').toLowerCase().includes(b.toLowerCase()));
    case 'product': return !!c.product_key && c.product_key === l.line;
    case 'listing': return c.listing_id === l.id;
    default: return false; // 指定分類（非美妝）、指定商品：無法確認，不套用
  }
}

export function discountOf(c: Coupon, price: number) {
  if (price < c.min_spend) return 0;
  let d = c.amount ?? 0;
  if (c.rate != null) { d = Math.round(price * (1 - c.rate)); if (c.cap != null) d = Math.min(d, c.cap); }
  return Math.max(0, Math.min(d, price));
}

// 單件結帳：平台券挑一張最划算的 + 賣場券挑一張最划算的（蝦皮、momo 一般規則）
export function applyCoupons(price: number, l: ListingLite, day: string, coupons: Coupon[], opts: { includeSpecial?: boolean } = {}): Applied {
  const ok = coupons.filter((c) => activeOn(c, day) && eligible(c, l, opts));
  const pick = (kind: string, p: number) => ok.filter((c) => (kind === 'shop' ? c.kind === 'shop' : c.kind !== 'shop'))
    .map((c) => ({ c, d: discountOf(c, p) })).filter((x) => x.d > 0).sort((a, b) => b.d - a.d)[0];
  // 先套賣場券，再用折後金額判斷平台券門檻（蝦皮的計算順序）
  const shop = pick('shop', price);
  const afterShop = price - (shop?.d ?? 0);
  const plat = pick('platform', afterShop);
  const used = [shop?.c, plat?.c].filter(Boolean) as Coupon[];
  return { price: afterShop - (plat?.d ?? 0), base: price, used };
}

// 差一點才達門檻的券（湊單參考）
export function nearMiss(price: number, l: ListingLite, day: string, coupons: Coupon[]) {
  return coupons.filter((c) => activeOn(c, day) && eligible(c, l) && c.min_spend > price && c.min_spend <= price * 2.2)
    .sort((a, b) => a.min_spend - b.min_spend).slice(0, 3);
}

export function describe(c: Coupon) {
  const v = c.rate != null ? `${+(c.rate * 100).toFixed(1).replace(/\.0$/, '')} 折${c.cap ? `（最高折 $${c.cap}）` : ''}` : `折 $${c.amount}`;
  const when = [c.start_time && `${c.start_time} 開搶`, c.end_date ? `至 ${c.end_date.slice(5).replace('-', '/')}` : '兌完為止'].filter(Boolean).join('，');
  return `${SCOPE_NAME[c.scope] ?? ''}${c.scope_text ? `（${c.scope_text}）` : ''} ${c.min_spend ? `滿 $${c.min_spend.toLocaleString()} ` : ''}${v}，${when}${c.limited ? '，限量' : ''}`;
}
