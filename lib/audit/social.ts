// 社群口碑與影音：各平台搜尋引擎收錄的品牌相關貼文，加上本站論壇資料庫裡的提及數
import { ddg, mentionsBrand } from './common';
import { adminDb } from '../db';

export const SOCIAL_SITES = [
  { key: 'dcard', name: 'Dcard', site: 'dcard.tw', video: false },
  { key: 'ptt', name: 'PTT', site: 'ptt.cc', video: false },
  { key: 'threads', name: 'Threads', site: 'threads.com', video: false },
  { key: 'instagram', name: 'Instagram', site: 'instagram.com', video: false },
  { key: 'facebook', name: 'Facebook', site: 'facebook.com', video: false },
  { key: 'youtube', name: 'YouTube', site: 'youtube.com', video: true },
  { key: 'tiktok', name: 'TikTok', site: 'tiktok.com', video: true },
];

export async function auditSocial(brand: string, aliases: string[], prev?: { sites?: { key: string; status: number }[] }) {
  const name = aliases[0] ?? brand;
  const deadline = Date.now() + 48000; // 函式上限 60 秒，留時間存檔
  type Site = (typeof SOCIAL_SITES)[number] & { status: number; count: number; recent: number; samples: { title: string; url: string; date: string | null }[] };
  const sites: Site[] = [];
  // 依序查（同時送會被搜尋轉讀服務限流）；上次已經查到的平台沿用，只補查失敗的
  for (const s of SOCIAL_SITES) {
    const old = prev?.sites?.find((x) => x.key === s.key && x.status === 200);
    if (old) { sites.push(old as Site); continue; }
    if (Date.now() > deadline - 6000) { sites.push({ ...s, status: 0, count: 0, recent: 0, samples: [] }); continue; }
    // 只搜近一年（搜尋結果大多沒有日期，交給搜尋引擎過濾）
    const all = await ddg(`site:${s.site} ${name}`, { df: 'y', deadline });
    const rel = all.hits.filter((h) => mentionsBrand(`${h.title} ${h.snippet} ${h.url}`, aliases));
    sites.push({ ...s, status: all.status, count: rel.length, recent: rel.length, samples: rel.slice(0, 4).map((h) => ({ title: h.title, url: h.url, date: h.date })) });
  }
  // 本站論壇資料（PTT、Dcard、Threads、IG、FB，近 90 天）
  let forum = 0;
  try {
    const since = new Date(Date.now() - 90 * 86400e3).toISOString();
    const ors = aliases.slice(0, 4).flatMap((a) => [`title.ilike.%${a.replace(/[%,()]/g, '')}%`, `excerpt.ilike.%${a.replace(/[%,()]/g, '')}%`]).join(',');
    const { count } = await adminDb().from('ec_forum_posts').select('url', { count: 'exact', head: true }).gte('posted_at', since).or(ors);
    forum = count ?? 0;
  } catch {}
  return { sites, forum };
}
export type SocialResult = Awaited<ReturnType<typeof auditSocial>>;
