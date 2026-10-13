// 依商品標題自動判斷品牌、品項、規格
export type Classified = { brand: string | null; line: string | null; spec: string | null };

// 追蹤的產品（key 存在 ec_listings.line）。名稱以品牌官網的正式品名為準
export type Product = {
  key: string; brand: string; name: string; short: string;
  official?: { url: string; kind: 'avene' | 'ahc'; imageHint?: RegExp }; // imageHint：官網頁面上產品包裝圖的檔名
  queries: string[]; // 每天在 BigGo 搜尋蝦皮商城、酷澎用的關鍵字
};
export const PRODUCTS: Product[] = [
  { key: 'avene-thermal-water', brand: '雅漾 Avène', name: '雅漾舒護活泉水', short: '舒護活泉水',
    official: { kind: 'avene', url: 'https://www.eau-thermale-avene.tw/p/ya-yang-shu-hu-huo-quan-shui-3282779003131-2d6dc250' },
    queries: ['雅漾 舒護活泉水', 'Avene 活泉水 300ml', 'Avene 活泉水 150ml', 'Avene 活泉水 50ml'] },
  { key: 'ahc-b5-serum', brand: 'AHC', name: '瞬效保濕B5微導玻尿酸精華液', short: 'B5微導玻尿酸精華',
    official: { kind: 'ahc', url: 'https://tw.ahcbeauty.com/products/瞬效保濕b5玻尿酸精華液', imageHint: /B5_PREMIUM_EX_HYDRA_B5_SOOTHER_30ml_1\.png|B5_PREMIUM_HYDRA_B5_SOOTHER_30ml_OUTBOX_FRONT/ },
    queries: ['AHC 瞬效保濕B5微導玻尿酸精華', 'AHC B5 玻尿酸精華 30ml'] },
  { key: 'ahc-aqualuronic-serum', brand: 'AHC', name: '醫美科研超導水光玻尿酸精華', short: '超導水光玻尿酸精華',
    official: { kind: 'ahc', url: 'https://tw.ahcbeauty.com/products/ahc-醫美科研超導水光玻尿酸精華', imageHint: /HYALURO-DEEP_VOLUME_5_INTRA-SERUM_40ML_PACK_SHOT\.(png|jpg)/ },
    queries: ['AHC 超導水光玻尿酸精華', 'AHC 水光玻尿酸精華 40ml'] },
  { key: 'olay-regenerist-cream', brand: 'OLAY', name: '新生高效緊緻護膚霜（大紅瓶）', short: '大紅瓶護膚霜',
    queries: ['OLAY 新生高效緊緻護膚霜', 'OLAY 大紅瓶 乳霜 50g'] },
  { key: 'olay-peptide-cream', brand: 'OLAY', name: '胜肽超紅瓶緊緻乳霜', short: '胜肽超紅瓶乳霜',
    queries: ['OLAY 胜肽 超紅瓶 乳霜', 'OLAY 胜肽專研緊緻乳霜'] },
];
export const CUSTOM = 'custom'; // 自行搜尋加入的商品
export const productOf = (key: string | null) => PRODUCTS.find((p) => p.key === key);
// 顯示用名稱：品名已含品牌（例如「雅漾舒護活泉水」）就不再重複加品牌
export const productLabel = (p: Product) => { const b = p.brand.split(' ')[0]; return p.name.startsWith(b) ? p.name : `${b} ${p.name}`; };

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
    if (i >= 0 && (other < 0 || i < other) && !/保濕化妝水(?!\/)|柔潤|潤澤化妝水/.test(t.slice(0, i))) line = 'avene-thermal-water';
  } else if (brand === 'AHC') {
    const noise = /精華水|精華乳|水乳|乳液|化妝水|潔顏|霜|露|面膜|眼|機能水|男士|防曬/;
    if (/B5/i.test(t) && /玻尿酸/.test(t) && /精華/.test(t) && !/超導水光|能量修護/.test(t) && !noise.test(t)) line = 'ahc-b5-serum';
    else if (/超導水光|水光玻尿酸/.test(t) && /精華/.test(t) && !noise.test(t)) line = 'ahc-aqualuronic-serum';
  } else if (brand === 'OLAY') {
    const cream = /乳霜|護膚霜|面霜|緊緻霜|凝霜/.test(t) && !/眼霜|防曬|CC|BB/.test(t);
    if (cream && /胜肽|超紅瓶/.test(t)) line = 'olay-peptide-cream';
    else if (cream && /新生高效|大紅瓶/.test(t)) line = 'olay-regenerist-cream';
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
  if (combo) return '組合 ' + combo[0].replace(/\s/g, '').replace(/[xX＊*]/g, '×').replace(/×1(?!\d)/g, '').toLowerCase();
  if (variant && vm) {
    const v = volOf(variant);
    const base = v || volOf(t.slice(0, vm.index));
    const mult = multOf(variant, v?.end ?? 0);
    if (base) return base.text + (mult ? ` ×${mult}` : '');
  }
  const v = volOf(t);
  if (!v) { const n = t.match(/(\d+)\s*入/); return n ? `${n[1]}入組（未標容量）` : null; }
  const mult = multOf(t, v.end);
  return v.text + (mult ? ` ×${mult}` : '');
}
