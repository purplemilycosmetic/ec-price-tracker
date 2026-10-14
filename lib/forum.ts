// 論壇美妝評論：每天抓 PTT（透過 PTT 網頁版 pttweb.cc，Vercel 直連 ptt.cc 會被擋）與 Reddit 的新文章
import { adminDb, todayTaipei } from './db';

export type Source = { id: string; name: string; kind: 'ptt' | 'reddit'; board: string; lang: 'zh' | 'en'; filter?: RegExp };

// 高流量的綜合板只留跟美妝保養有關的標題
const BEAUTY = /保養|美妝|彩妝|化妝|精華|乳液|面霜|乳霜|防曬|粉底|氣墊|口紅|唇|眼影|睫毛|卸妝|洗面|面膜|護膚|護髮|髮膜|洗髮|香水|醫美|敏感肌|痘|毛孔|玻尿酸|屈臣氏|康是美|寶雅|絲芙蘭|週年慶|雙11|美白|抗老|雅漾|AHC|OLAY|歐蕾|理膚寶水|薇姿|SK-?II|蘭蔻|雅詩蘭黛|資生堂|DR\.?WU/i;
export const SOURCES: Source[] = [
  { id: 'ptt-makeup', name: 'PTT 美妝板', kind: 'ptt', board: 'MakeUp', lang: 'zh' },
  { id: 'ptt-beautysalon', name: 'PTT 美容美髮板', kind: 'ptt', board: 'BeautySalon', lang: 'zh' },
  { id: 'ptt-womentalk', name: 'PTT 女板（美妝相關）', kind: 'ptt', board: 'WomenTalk', lang: 'zh', filter: BEAUTY },
  { id: 'ptt-lifeismoney', name: 'PTT 省錢板（美妝相關）', kind: 'ptt', board: 'Lifeismoney', lang: 'zh', filter: BEAUTY },
  { id: 'reddit-asianbeauty', name: 'Reddit r/AsianBeauty', kind: 'reddit', board: 'AsianBeauty', lang: 'en' },
  { id: 'reddit-skincare', name: 'Reddit r/SkincareAddiction', kind: 'reddit', board: 'SkincareAddiction', lang: 'en' },
  { id: 'reddit-koreanbeauty', name: 'Reddit r/koreanbeauty', kind: 'reddit', board: 'koreanbeauty', lang: 'en' },
];
export const sourceName = (id: string) => SOURCES.find((s) => s.id === id)?.name ?? id;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
const stripTags = (s: string) => decode(decode(s).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

export type RawPost = { url: string; source: string; board: string; lang: string; title: string; excerpt?: string; pushes: number; posted_at: string };

function parsePtt(html: string, s: Source): RawPost[] {
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

function parseReddit(xml: string, s: Source): RawPost[] {
  const out: RawPost[] = [];
  for (const e of xml.split('<entry>').slice(1)) {
    const title = stripTags(e.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] || '');
    const url = e.match(/<link[^>]*href="([^"]+)"/)?.[1];
    const when = e.match(/<(?:published|updated)>([^<]+)</)?.[1];
    if (!title || !url || !when) continue;
    const body = stripTags(e.match(/<content[^>]*>([\s\S]*?)<\/content>/)?.[1] || '').replace(/submitted by.*$/i, '').replace(/\[link\]|\[comments\]/g, '').trim();
    out.push({ url: decode(url), source: s.id, board: s.board, lang: 'en', title, excerpt: body.slice(0, 400), pushes: 0, posted_at: new Date(when).toISOString() });
  }
  return out;
}

async function get(url: string) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8' }, cache: 'no-store', signal: AbortSignal.timeout(9000) });
  return { status: r.status, text: r.ok ? await r.text() : '' };
}

export async function runForum() {
  const db = adminDb();
  const day = todayTaipei();
  const t0 = Date.now();
  const stats: Record<string, number> = {};
  const all: RawPost[] = [];
  const one = async (s: Source) => {
    try {
      const url = s.kind === 'ptt' ? `https://www.pttweb.cc/bbs/${s.board}` : `https://www.reddit.com/r/${s.board}/top/.rss?t=day`;
      let r = await get(url);
      if (r.status !== 200 && s.kind === 'reddit') { await new Promise((ok) => setTimeout(ok, 2500)); r = await get(url); }
      const posts = r.status === 200 ? (s.kind === 'ptt' ? parsePtt(r.text, s) : parseReddit(r.text, s)) : [];
      stats[s.id] = r.status === 200 ? posts.length : -r.status;
      all.push(...posts);
    } catch { stats[s.id] = -1; }
  };
  // PTT 同時抓；Reddit 容易因短時間請求太多被拒絕，一個一個抓、中間間隔
  await Promise.all([
    Promise.all(SOURCES.filter((s) => s.kind === 'ptt').map(one)),
    (async () => { for (const s of SOURCES.filter((x) => x.kind === 'reddit')) { await one(s); await new Promise((ok) => setTimeout(ok, 1500)); } })(),
  ]);
  // 一個網址只留一筆
  const uniq = Array.from(new Map(all.map((p) => [p.url, p])).values());
  if (uniq.length) {
    // 不帶 excerpt 欄位：已存的內文摘要不會被覆蓋
    const rows = uniq.map(({ excerpt, ...p }) => ({ ...p, last_seen: day }));
    await db.from('ec_forum_posts').upsert(rows, { onConflict: 'url' });
    const withEx = uniq.filter((p) => p.excerpt);
    for (const p of withEx) await db.from('ec_forum_posts').update({ excerpt: p.excerpt }).eq('url', p.url).is('excerpt', null);
  }
  // PTT 文章的內文開頭（網頁版的 og:description）：每次補最多 24 篇
  const { data: need } = await db.from('ec_forum_posts').select('url,board').like('url', 'https://www.ptt.cc/%').is('excerpt', null)
    .gte('posted_at', new Date(Date.now() - 30 * 86400_000).toISOString()).order('posted_at', { ascending: false }).limit(16);
  const queue = [...(need || [])];
  let filled = 0;
  const exStatus: Record<string, number> = {};
  await Promise.all([1, 2].map(async () => {
    while (queue.length && Date.now() - t0 < 28000) {
      const n = queue.shift()!;
      try {
        const r = await get(n.url.replace('https://www.ptt.cc/bbs/', 'https://www.pttweb.cc/bbs/').replace(/\.html$/, ''));
        const d = r.text.match(/property="og:description" content="([^"]*)"/)?.[1];
        exStatus[r.status] = (exStatus[r.status] || 0) + 1;
        if (r.status === 200) {
          // 去掉 PTT 簽名檔與「發信站」之後的樣板文字
          const t = stripTags(d || '').split(/※ ?發信站|--\s/)[0].replace(/https?:\/\/\S+/g, '').trim();
          await db.from('ec_forum_posts').update({ excerpt: t.slice(0, 400) || '(無內文)' }).eq('url', n.url);
          filled++;
        }
        await new Promise((ok) => setTimeout(ok, 400));
      } catch (e) { exStatus.err = (exStatus.err || 0) + 1; }
    }
  }));
  const result = { forum_posts: uniq.length, forum_excerpts: filled, forum_excerpt_status: exStatus, forum_sources: stats, ms: Date.now() - t0 };
  await db.from('ec_debug').insert({ url: 'forum-run', status: 200, body: JSON.stringify(result) });
  return result;
}
