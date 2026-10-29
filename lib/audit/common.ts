// 品牌健檢共用工具
export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';

export async function get(url: string, timeout = 12000, headers: Record<string, string> = {}) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'zh-TW,zh;q=0.9', ...headers }, cache: 'no-store', redirect: 'follow', signal: AbortSignal.timeout(timeout) });
    const text = await r.text();
    return { status: r.status, text, ms: Date.now() - t0, finalUrl: r.url, headers: r.headers };
  } catch (e) {
    return { status: -1, text: '', ms: Date.now() - t0, finalUrl: url, headers: new Headers(), error: String(e).slice(0, 120) };
  }
}

export const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
export const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

// 品牌名稱的各種寫法：「碧歐斯 Bio-essence」→ 碧歐斯、Bio-essence、bioessence
export function aliasesOf(brand: string) {
  const parts = brand.split(/[\s／/|（）()]+/).map((x) => x.trim()).filter((x) => x.length >= 2);
  const set = new Set<string>([brand.trim(), ...parts]);
  for (const p of parts) if (/[-\s.]/.test(p)) set.add(p.replace(/[-\s.]/g, ''));
  return Array.from(set).filter(Boolean);
}
export function mentionsBrand(text: string, aliases: string[]) {
  const t = text.toLowerCase().replace(/[-\s.]/g, '');
  return aliases.some((a) => t.includes(a.toLowerCase().replace(/[-\s.]/g, '')));
}

// DuckDuckGo 搜尋（經 r.jina.ai 讀取）：標題、網址、摘要、日期
export type Hit = { title: string; url: string; snippet: string; date: string | null; host: string };
export function parseDdg(md: string): Hit[] {
  const out: Hit[] = [];
  for (const b of md.split(/\n## \[/).slice(1)) {
    const title = decode(b.slice(0, b.indexOf('](')).trim());
    const enc = b.match(/uddg=([^&)]+)/)?.[1];
    if (!title || !enc) continue;
    let url = '';
    try { url = decodeURIComponent(enc); } catch { continue; }
    const texts = Array.from(b.matchAll(/\[([^\]]{8,})\]\(https:\/\/duckduckgo\.com\/l\//g)).map((m) => m[1]).filter((t) => !/^!\[|^www\.|^[a-z0-9-]+\.[a-z]/i.test(t));
    const snippet = decode(texts.sort((x, y) => y.length - x.length)[0] || '').replace(/\*\*/g, '');
    if (/duckduckgo\.com|bing\.com\/aclick/.test(url)) continue; // 廣告
    out.push({ title, url, snippet, date: b.match(/(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}/)?.[1] ?? null, host: hostOf(url) });
  }
  return out;
}
// 免費轉讀服務短時間請求太多會回 429：同一個程序內排隊、間隔送出，被限流就等久一點再試
let gate = Promise.resolve();
let last = 0;
const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
async function slot(gap = 1500) {
  const prev = gate;
  let release = () => {};
  gate = new Promise<void>((ok) => { release = ok; });
  await prev;
  const wait = last + gap - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
  release();
}
export async function ddg(q: string, opts: { df?: 'd' | 'w' | 'm' | 'y'; deadline?: number } = {}) {
  const u = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}${opts.df ? `&df=${opts.df}` : ''}&kl=tw-tzh`;
  const deadline = opts.deadline ?? Date.now() + 40000;
  let r = { status: 0, text: '' } as { status: number; text: string };
  for (const backoff of [0, 4000, 9000]) {
    if (backoff) { if (Date.now() + backoff + 8000 > deadline) break; await sleep(backoff); }
    await slot();
    r = await get('https://r.jina.ai/' + u, Math.max(5000, Math.min(20000, deadline - Date.now())));
    if (r.status === 200) break;
  }
  return { status: r.status, hits: r.status === 200 ? parseDdg(r.text) : [] };
}

// 網域分類
const RETAIL = /momoshop|shopee|coupang|pchome|watsons|cosmed|poya|yahoo|books\.com|rakuten|sephora|tw\.buy|etmall|friday|costco|carrefour|pxmart|7-11|family|amazon|iherb|biggo|feebee/;
const SOCIAL = /dcard|ptt\.cc|pttweb|threads|instagram|facebook|fb\.com|youtube|youtu\.be|tiktok|xiaohongshu|xhslink|twitter|x\.com|line\.me|mobile01|lemon8/; // 痞客邦等部落格算第三方內容
const VIDEO = /youtube|youtu\.be|tiktok|vimeo/;
const WIKI = /wikipedia|baike|zhihu/;
export function kindOf(host: string, officialHost: string) {
  if (!host) return 'other';
  if (host === officialHost || host.endsWith('.' + officialHost)) return 'official';
  if (VIDEO.test(host)) return 'video';
  if (SOCIAL.test(host)) return 'social';
  if (RETAIL.test(host)) return 'retail';
  if (WIKI.test(host)) return 'wiki';
  return 'media';
}
export const KIND_NAME: Record<string, string> = { official: '官網', retail: '電商通路', social: '社群', video: '影音', media: '媒體／部落格', wiki: '百科', other: '其他' };

// 常見美妝品牌（同一品牌的不同寫法放同一組，找出推薦情境中出現的競品）
export const BRAND_GROUPS: string[][] = [
  ['雅漾', 'Avène', 'Avene'], ['AHC'], ['OLAY', '歐蕾'], ['理膚寶水', 'La Roche-Posay', 'LRP'], ['薇姿', 'Vichy'], ['貝膚黛瑪', 'Bioderma', '貝德瑪'],
  ['適樂膚', 'CeraVe'], ['舒特膚', 'Cetaphil'], ['珂潤', 'Curel'], ['資生堂', 'Shiseido'], ['蘭蔻', 'Lancome', 'Lancôme'], ['雅詩蘭黛', 'Estee Lauder', 'Estée Lauder'],
  ['SK-II', 'SK2'], ['倩碧', 'Clinique'], ['契爾氏', "Kiehl's", 'Kiehls'], ['碧歐斯', 'Bio-essence', 'Bio essence'], ['德美醫研', 'Derma Lab'], ['艾詩', 'Enchanteur'],
  ['DR.WU', '達爾膚'], ['寵愛之名'], ['我的美麗日記'], ['露得清', 'Neutrogena'], ['妮維雅', 'Nivea'], ['肌研', 'Hada Labo'], ['專科', 'Senka'],
  ['innisfree', '悅詩風吟'], ['蘭芝', 'Laneige'], ['COSRX'], ['Anua'], ['Torriden'], ['Round Lab'], ['Medicube'], ['Dr.Jart+', 'Dr. Jart'], ['依洛嘉', 'Eucerin'],
  ['絲塔芙'], ['The Ordinary'], ['寶拉珍選', "Paula's Choice"], ['1028'], ['巴黎萊雅', "L'Oreal", "L'Oréal"], ['植村秀', 'Shu Uemura'], ['肌膚之鑰', 'Clé de Peau'],
  ['雪花秀', 'Sulwhasoo'], ['修麗可', 'SkinCeuticals'], ['芙美得', 'Freeplus'], ['Embryolisse'], ['優麗雅', 'Uriage'], ['慕之恬廊', 'Mustela'], ['台塑生醫'], ['牛爾', 'Naruko'],
  ['曼秀雷敦', 'Mentholatum'], ['Caudalie', '歐緹麗'], ['Evian', '依雲'], ['MAC', 'M.A.C'], ['Kanebo', '佳麗寶'], ['FANCL', '芳珂'], ['Sofina', '蘇菲娜'],
];
// 文字中出現的品牌（每組只算一次，用第一個名稱表示）
export function brandsIn(text: string, exclude: string[] = []) {
  const t = text.toLowerCase();
  return BRAND_GROUPS.filter((g) => g.some((n) => t.includes(n.toLowerCase())) && !g.some((n) => mentionsBrand(n, exclude))).map((g) => g[0]);
}
