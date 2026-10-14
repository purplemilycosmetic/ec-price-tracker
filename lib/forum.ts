// 台灣論壇與社群的美妝討論：
// - PTT：經 PTT 網頁版 pttweb.cc 讀取（ptt.cc 本站擋雲端主機）
// - Threads：經網頁轉讀服務 r.jina.ai 讀取 Threads 搜尋結果（免登入）
// - Dcard、Instagram、Facebook：本站擋雲端主機或需登入，改用 DuckDuckGo「site:」搜尋近一週被收錄的貼文標題與摘要
// 每小時執行一次：PTT 每次都抓；搜尋類工作今天成功過就跳過，失敗的下一小時再試
import { adminDb, todayTaipei } from './db';
import { jobLog, logJob } from './jobs';

export type Platform = 'ptt' | 'dcard' | 'threads' | 'instagram' | 'facebook';
export const PLATFORMS: { key: Platform; name: string }[] = [
  { key: 'ptt', name: 'PTT' }, { key: 'dcard', name: 'Dcard' }, { key: 'threads', name: 'Threads' },
  { key: 'instagram', name: 'Instagram' }, { key: 'facebook', name: 'Facebook' },
];
export const platformOf = (source: string) => source.split('-')[0] as Platform;

const BEAUTY = /保養|美妝|彩妝|化妝|精華|乳液|面霜|乳霜|霜|防曬|粉底|氣墊|口紅|唇|眼影|睫毛|卸妝|洗面|面膜|護膚|護髮|髮膜|洗髮|香水|醫美|敏感肌|肌膚|皮膚|痘|毛孔|玻尿酸|屈臣氏|康是美|寶雅|絲芙蘭|週年慶|雙11|美白|抗老|保濕|雅漾|AHC|OLAY|歐蕾|理膚寶水|薇姿|SK-?II|蘭蔻|雅詩蘭黛|資生堂|DR\.?WU|開箱|試用|心得/i;

type Board = { id: string; name: string; board: string; filter?: RegExp };
const BOARDS: Board[] = [
  { id: 'ptt-makeup', name: 'PTT 美妝板', board: 'MakeUp' },
  { id: 'ptt-beautysalon', name: 'PTT 美容美髮板', board: 'BeautySalon' },
  { id: 'ptt-womentalk', name: 'PTT 女板', board: 'WomenTalk', filter: BEAUTY },
  { id: 'ptt-lifeismoney', name: 'PTT 省錢板', board: 'Lifeismoney', filter: BEAUTY },
];
// 搜尋用關鍵字（Threads 直接搜；Dcard／IG／FB 用 site: 搜尋）
const QUERIES = ['保養品', '精華液', '美妝', '防曬', '敏感肌', '雅漾', 'AHC', 'OLAY'];
const SITES: { id: Platform; name: string; site: string; keep: RegExp }[] = [
  { id: 'dcard', name: 'Dcard', site: 'dcard.tw', keep: /dcard\.tw\/(f\/[^/]+\/p\/\d+|@[^/]+\/post\/\d+)/ },
  { id: 'instagram', name: 'Instagram', site: 'instagram.com', keep: /instagram\.com\/(p|reel)\// },
  { id: 'facebook', name: 'Facebook', site: 'facebook.com', keep: /facebook\.com\// },
];
export const SOURCE_NAMES: Record<string, string> = {
  ...Object.fromEntries(BOARDS.map((b) => [b.id, b.name])), threads: 'Threads', dcard: 'Dcard', instagram: 'Instagram', facebook: 'Facebook',
};
export const SOURCE_IDS = Object.keys(SOURCE_NAMES);
export const sourceName = (id: string) => SOURCE_NAMES[id] ?? id;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
const stripTags = (s: string) => decode(decode(s).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };

export type RawPost = { url: string; source: string; board: string | null; lang: string; title: string; excerpt?: string; pushes: number; posted_at: string };

async function get(url: string, timeout = 9000) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'zh-TW,zh;q=0.9' }, cache: 'no-store', signal: AbortSignal.timeout(timeout) });
  return { status: r.status, text: r.ok ? await r.text() : '' };
}
const viaJina = (url: string) => get('https://r.jina.ai/' + url, 25000);

function parsePtt(html: string, s: Board): RawPost[] {
  const out: RawPost[] = [];
  const seen = new Set<string>();
  for (const c of html.split('class="e7-container"').slice(1)) {
    const id = c.match(new RegExp(`/bbs/${s.board}/(M\\.\\d+\\.A\\.[0-9A-F]+)"`))?.[1];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (/置底/.test(c.slice(0, 3000))) continue;
    const title = decode(c.match(/e7-show-if-device-is-not-xs[^>]*><span[^>]*>([^<]*)<\/span>/)?.[1] || '').trim();
    if (!title || /^\[公告\]|^Re: ?\[公告\]/.test(title)) continue;
    if (s.filter && !s.filter.test(title)) continue;
    const raw = c.match(/e7-recommendScore[\s\S]*?<span[^>]*>([^<]*)<\/span>/)?.[1]?.trim() || '';
    const pushes = raw === '爆' ? 100 : /^X\d?$/.test(raw) ? -10 : parseInt(raw, 10) || 0;
    out.push({ url: `https://www.ptt.cc/bbs/${s.board}/${id}.html`, source: s.id, board: s.board, lang: 'zh', title, pushes,
      posted_at: new Date(+id.split('.')[1] * 1000).toISOString() });
  }
  return out;
}

// Threads 搜尋結果（r.jina.ai 轉成的 Markdown）：每則貼文以作者大頭貼連結開頭，接著內文、Translate、互動數
export function parseThreads(md: string, q: string): RawPost[] {
  const out: RawPost[] = [];
  const now = new Date().toISOString();
  for (const b of md.split(/\[!\[Image \d+: [^\]]*profile picture\]/).slice(1)) {
    const um = b.match(/\]\(https:\/\/www\.threads\.(?:net|com)\/@([^)\s/]+)\)/);
    if (!um) continue;
    const user = um[1];
    const body = b.slice((um.index ?? 0) + um[0].length).split(/\n\s*Translate\s*\n/)[0];
    const lines = body.split('\n').map((l) => l.trim())
      .filter((l) => l && !/^!\[|^\[!\[|^\d[\d,.萬K]*$|^\[.*\]\(https?:\/\/[^)]+\)$/.test(l));
    const text = lines.join(' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim();
    if (text.length < 4) continue;
    const nums = (b.split(/\n\s*Translate\s*\n/)[1] || '').split('\n').map((l) => l.trim()).filter((l) => /^\d[\d,]*$/.test(l)).map((l) => +l.replace(/,/g, ''));
    out.push({ url: `https://www.threads.net/@${user}#${hash(text)}`, source: 'threads', board: q, lang: 'zh',
      title: text.slice(0, 80), excerpt: text.slice(0, 400), pushes: nums[0] || 0, posted_at: now });
  }
  return out;
}

// DuckDuckGo 搜尋結果（r.jina.ai 轉成的 Markdown）
export function parseDdg(md: string, site: (typeof SITES)[number], q: string): RawPost[] {
  const out: RawPost[] = [];
  for (const b of md.split(/\n## \[/).slice(1)) {
    const title = decode(b.slice(0, b.indexOf('](')).trim());
    const enc = b.match(/uddg=([^&)]+)/)?.[1];
    if (!title || !enc) continue;
    const url = decodeURIComponent(enc);
    if (!site.keep.test(url)) continue;
    const date = b.match(/(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}/)?.[1];
    const texts = Array.from(b.matchAll(/\[([^\]]{8,})\]\(https:\/\/duckduckgo\.com\/l\//g)).map((m) => m[1]).filter((t) => !/^!\[|^www\.|^[a-z]+\.[a-z]/.test(t));
    const snippet = decode(texts.sort((x, y) => y.length - x.length)[0] || '');
    const t = title.replace(/\s*[|\-–]\s*(Dcard|Facebook|Instagram).*$/i, '').trim();
    if (!BEAUTY.test(t + snippet)) continue; // 例如 FB 的「機車保養」
    out.push({ url, source: site.id, board: q, lang: 'zh', title: t.slice(0, 120), excerpt: snippet.slice(0, 400), pushes: 0,
      posted_at: date ? new Date(date + 'T12:00:00+08:00').toISOString() : new Date().toISOString() });
  }
  return out;
}

async function save(posts: RawPost[], day: string) {
  const uniq = Array.from(new Map(posts.map((p) => [p.url, p])).values());
  if (!uniq.length) return 0;
  const db = adminDb();
  // 已存在的貼文保留第一次看到的時間（Threads 沒有發文時間，用第一次看到的時間代替）
  const { data: have } = await db.from('ec_forum_posts').select('url').in('url', uniq.map((p) => p.url));
  const old = new Set((have || []).map((h) => h.url));
  const fresh = uniq.filter((p) => !old.has(p.url));
  if (fresh.length) await db.from('ec_forum_posts').upsert(fresh.map((p) => ({ ...p, excerpt: p.excerpt ?? null, last_seen: day })), { onConflict: 'url' });
  const seen = uniq.filter((p) => old.has(p.url));
  for (const p of seen) await db.from('ec_forum_posts').update({ last_seen: day, pushes: p.pushes, title: p.title }).eq('url', p.url);
  return fresh.length;
}

export async function runForum(budgetMs = 42000) {
  const db = adminDb();
  const day = todayTaipei();
  const t0 = Date.now();
  const stats: Record<string, number | string> = {};

  // 1. PTT 看板（每次都抓，很快）
  const ptt: RawPost[] = [];
  await Promise.all(BOARDS.map(async (s) => {
    try {
      const r = await get(`https://www.pttweb.cc/bbs/${s.board}`);
      const posts = r.status === 200 ? parsePtt(r.text, s) : [];
      stats[s.id] = r.status === 200 ? posts.length : `HTTP ${r.status}`;
      ptt.push(...posts);
    } catch { stats[s.id] = '逾時'; }
  }));
  stats.ptt_new = await save(ptt, day);

  // 2. 搜尋類工作：今天還沒成功的，依序抓到時間用完為止
  const jobs = [
    ...QUERIES.map((q) => ({ job: `forum:threads:${q}`, run: async () => {
      const r = await viaJina(`https://www.threads.net/search?q=${encodeURIComponent(q)}&filter=recent`);
      return { status: r.status, posts: r.status === 200 ? parseThreads(r.text, q) : [] };
    } })),
    ...SITES.flatMap((s) => QUERIES.map((q) => ({ job: `forum:${s.id}:${q}`, run: async () => {
      const r = await viaJina(`https://html.duckduckgo.com/html/?df=w&q=${encodeURIComponent(`site:${s.site} ${q}`)}`);
      return { status: r.status, posts: r.status === 200 ? parseDdg(r.text, s, q) : [] };
    } }))),
  ];
  const log = await jobLog(day, 'forum:');
  // 沒成功過、嘗試少的先做；同平台輪流，避免一次打同一個網站太多次
  const pending = jobs.filter((j) => !log.get(j.job)?.ok && (log.get(j.job)?.attempts ?? 0) < 12)
    .sort((a, b) => (log.get(a.job)?.attempts ?? 0) - (log.get(b.job)?.attempts ?? 0));
  let done = 0, added = 0;
  for (const j of pending) {
    if (Date.now() - t0 > budgetMs) break;
    try {
      const r = await j.run();
      // 回應正常但沒有結果（例如那個關鍵字本週沒新貼文）也算完成
      await logJob(day, j.job, { ok: r.status === 200, status: r.status, items: r.posts.length }, log);
      added += await save(r.posts, day);
      done++;
    } catch { await logJob(day, j.job, { ok: false, status: -1, items: 0 }, log); }
    await new Promise((ok) => setTimeout(ok, 1500));
  }
  stats.search_done = done;
  stats.search_pending = pending.length - done;
  stats.search_new = added;

  // 3. PTT 內文開頭：時間有剩才補
  let filled = 0;
  if (Date.now() - t0 < budgetMs) {
    const { data: need } = await db.from('ec_forum_posts').select('url').like('url', 'https://www.ptt.cc/%').is('excerpt', null)
      .gte('posted_at', new Date(Date.now() - 30 * 86400_000).toISOString()).order('posted_at', { ascending: false }).limit(8);
    for (const n of need || []) {
      if (Date.now() - t0 > budgetMs + 5000) break;
      try {
        const r = await get(n.url.replace('https://www.ptt.cc/bbs/', 'https://www.pttweb.cc/bbs/').replace(/\.html$/, ''));
        if (r.status !== 200) continue;
        const d = r.text.match(/property="og:description" content="([^"]*)"/)?.[1];
        const t = stripTags(d || '').split(/※ ?發信站|--\s/)[0].replace(/https?:\/\/\S+/g, '').trim();
        await db.from('ec_forum_posts').update({ excerpt: t.slice(0, 400) || '(無內文)' }).eq('url', n.url);
        filled++;
      } catch {}
    }
  }
  stats.ptt_excerpts = filled;
  stats.ms = Date.now() - t0;
  await db.from('ec_debug').insert({ url: 'forum-run', status: 200, body: JSON.stringify(stats) });
  return stats;
}
