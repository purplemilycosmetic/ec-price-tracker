// 依商品標題自動判斷品牌、品項、規格
export type Classified = { brand: string | null; line: string | null; spec: string | null };

export const LINES: { brand: string; line: string }[] = [
  { brand: '雅漾 Avène', line: '活泉水噴霧' },
  { brand: 'AHC', line: '精華液' },
  { brand: 'AHC', line: '原液' },
  { brand: 'OLAY', line: '乳霜' },
];

export function classify(title: string): Classified {
  const t = title || '';
  let brand: string | null = null;
  if (/雅漾|av[eè]ne/i.test(t)) brand = '雅漾 Avène';
  else if (/\bAHC\b/i.test(t)) brand = 'AHC';
  else if (/olay|歐蕾/i.test(t)) brand = 'OLAY';

  let line: string | null = null;
  if (brand === '雅漾 Avène') {
    // 主商品要是活泉水：「精華霜 送活泉水(小)」這種贈品組不算
    const i = t.search(/活泉水|噴霧/);
    const other = t.search(/霜|精華|精萃|乳|凝膠|面膜|眼|卸妝|潔膚|防曬|洗/);
    if (i >= 0 && (other < 0 || i < other)) line = '活泉水噴霧';
  } else if (brand === 'AHC') {
    if (/原液/.test(t)) line = '原液';
    else if (/精華|安瓶|精萃/.test(t) && !/精華水|精華乳|化妝水|霜|防曬|面膜|眼/.test(t)) line = '精華液';
  } else if (brand === 'OLAY') {
    if (/霜/.test(t) && !/眼霜|防曬|CC|BB|乳液/.test(t)) line = '乳霜';
  }
  return { brand, line, spec: parseSpec(t) };
}

export function parseSpec(t: string): string | null {
  // 組合包，例如 300mlx1+150mlx2
  const combo = t.match(/\d+\s*(?:ml|g)\s*(?:[x×X＊*]\s*\d+)?(?:\s*\+\s*\d+\s*(?:ml|g)\s*(?:[x×X＊*]\s*\d+)?)+/i);
  if (combo) return '組合 ' + combo[0].replace(/\s/g, '').replace(/[xX＊*]/g, '×').replace(/×1(?!\d)/g, '').toLowerCase();
  const vol = t.match(/(\d+(?:\.\d+)?)\s*(ml|g)(?![a-wyz])/i);
  if (!vol) { const n = t.match(/(\d+)\s*入/); return n ? `${n[1]}入組（未標容量）` : null; }
  let spec = `${vol[1]}${vol[2].toLowerCase()}`;
  const after = t.slice((vol.index ?? 0) + vol[0].length, (vol.index ?? 0) + vol[0].length + 8);
  const mult = after.match(/^\s*[x×X＊*]\s*(\d+)/) || t.match(/(\d+)\s*入(?:組)?/);
  if (mult && +mult[1] > 1) spec += ` ×${mult[1]}`;
  return spec;
}
