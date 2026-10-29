// 社群口碑與影音：各平台搜尋引擎收錄的品牌相關貼文，加上本站論壇資料庫裡的提及數
import { ddg, mentionsBrand } from './common';
import { adminDb } from '../db';

export const SOCIAL_SITES = [
  { key: 'dcard', name: 'Dcard', site: 'dcard.tw', video: false },
  { key: 'ptt', name: 'PTT', site: 'ptt.cc', video: false },
  { key: 'threads', name: 'Threads', site: 'threads.net', video: false },
  { key: 'instagram', name: 'Instagram', site: 'instagram.com', video: false },
  { key: 'facebook', name: 'Facebook', site: 'facebook.com', video: false },
  { key: 'youtube', name: 'YouTube', site: 'youtube.com', video: true },
  { key: 'tiktok', name: 'TikTok', site: 'tiktok.com', video: true },
];

export async function auditSocial(brand: string, aliases: string[]) {
  const name = aliases[0] ?? brand;
  const sites = await Promise.all(SOCIAL_SITES.map(async (s, i) => {
    await new Promise((ok) => setTimeout(ok, i * 600)); // 錯開，避免轉讀服務限流
    const all = await ddg(`site:${s.site} ${name}`);
    const rel = all.hits.filter((h) => mentionsBrand(`${h.title} ${h.snippet} ${h.url}`, aliases));
    const yearAgo = new Date(Date.now() - 365 * 86400e3).toISOString().slice(0, 10);
    return { ...s, status: all.status, count: rel.length, recent: rel.filter((h) => h.date && h.date >= yearAgo).length, samples: rel.slice(0, 4).map((h) => ({ title: h.title, url: h.url, date: h.date })) };
  }));
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
