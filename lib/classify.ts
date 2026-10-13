// 依商品標題自動判斷品牌、品項、規格
export type Classified = { brand: string | null; line: string | null; spec: string | null };

export const LINES: { brand: string; line: string }[] = [
  { brand: '雅漾 Avène', line: '活泉水噴霧' },
  { brand: 'AHC', line: '精華液' },
  { brand: 'AHC', line: '原液' },
  { brand: 'OLAY', line: '乳霜' },
];

export function classify(title: string): Classified {
  const t = normalize(title);
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

const CN: Record<string, string> = { 一: '1', 二: '2', 兩: '2', 三: '3', 四: '4', 五: '5', 六: '6', 七: '7', 八: '8', 九: '9', 十: '10' };
export function normalize(t: string) {
  return (t || '').normalize('NFKC').replace(/([一二兩三四五六七八九十])\s*(入|瓶|罐|件)/g, (_, c, u) => CN[c] + u);
}

function volOf(t: string) {
  const m = t.match(/(\d+(?:\.\d+)?)\s*(ml|g)(?![a-wyz])/i);
  return m ? { text: `${m[1]}${m[2].toLowerCase()}`, end: (m.index ?? 0) + m[0].length } : null;
}
function multOf(t: string, from = 0) {
  const after = t.slice(from, from + 8).match(/^\s*[x×X＊*✖]\s*(\d+)/);
  const m = after || t.match(/(\d+)\s*(?:入|瓶|罐)(?:組)?/) || t.match(/[x×X＊*✖]\s*(\d+)\s*\(?瓶/);
  return m && +m[1] > 1 ? +m[1] : null;
}

// 規格：容量 + 入數。標題結尾括號是平台上選的規格（例如蝦皮「（3入組_買3送3）」），優先採用
export function parseSpec(raw: string): string | null {
  const t = normalize(raw);
  const combo = t.match(/\d+\s*(?:ml|g)\s*(?:[x×X＊*]\s*\d+)?(?:\s*\+\s*\d+\s*(?:ml|g)\s*(?:[x×X＊*]\s*\d+)?)+/i);
  // NFKC 會把全形括號轉成半形，所以兩種都比對；括號內沒有容量或入數就忽略（例如「(化妝水/噴霧)」）
  const vm = t.match(/[（(]([^（）()]*)[）)]\s*$/);
  const variant = vm && !/^\s*(送|贈|加贈)/.test(vm[1]) && (volOf(vm[1]) || /\d+\s*(入|瓶|罐|件)/.test(vm[1])) ? vm[1] : null;
  if (variant && vm) {
    const v = volOf(variant);
    const base = v || volOf(t.slice(0, vm.index));
    const mult = multOf(variant, v?.end ?? 0);
    if (base) return base.text + (mult ? ` ×${mult}` : '');
  }
  if (combo) return '組合 ' + combo[0].replace(/\s/g, '').replace(/[xX＊*]/g, '×').replace(/×1(?!\d)/g, '').toLowerCase();
  const v = volOf(t);
  if (!v) { const n = t.match(/(\d+)\s*入/); return n ? `${n[1]}入組（未標容量）` : null; }
  const mult = multOf(t, v.end);
  return v.text + (mult ? ` ×${mult}` : '');
}
