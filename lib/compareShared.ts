// 比較：任意產品、規格、平台的每日價格線

export type Line = { product: string; spec: string; platform: string; stat: 'avg' | 'min'; unit: boolean; coupon: boolean };
export const CMP_PLATFORMS = [
  { key: 'all', name: '全部平台' }, { key: 'momo', name: 'momo' }, { key: 'shopee', name: '蝦皮商城' }, { key: 'coupang', name: '酷澎' },
];
// 色盲友善的對比色，依線的順序使用
export const CMP_COLORS = ['#2a78d6', '#d55181', '#c98a00', '#1baf7a', '#7a4fd0', '#eb6834'];

export const encode = (l: Line) => [l.product, l.spec, l.platform, l.stat, l.unit ? 1 : 0, l.coupon ? 1 : 0].join('~');
export function decode(s: string): Line | null {
  const [product, spec = '', platform = 'all', stat = 'avg', unit = '0', coupon = '0'] = s.split('~');
  if (!product) return null;
  return { product, spec, platform: CMP_PLATFORMS.some((p) => p.key === platform) ? platform : 'all', stat: stat === 'min' ? 'min' : 'avg', unit: unit === '1', coupon: coupon === '1' };
}

// 規格裡的入數：「300ml ×3」→ 3、「10入組」→ 10；組合包或沒寫 → 1
export const unitsOf = (spec: string | null) => (spec?.startsWith('組合') ? 1 : +(spec?.match(/×\s*(\d+)\s*$/)?.[1] || spec?.match(/(\d+)\s*入/)?.[1] || 1));

