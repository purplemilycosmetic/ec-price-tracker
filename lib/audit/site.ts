// 官網結構檢查：首頁＋幾個內頁的 SEO 標籤、結構化資料、AI 讀取條件
import { get, decode, hostOf } from './common';

export type PageCheck = {
  url: string; status: number; ms: number; bytes: number;
  title: string; description: string; canonical: string | null; noindex: boolean; viewport: boolean; lang: string | null;
  h1: number; images: number; imagesNoAlt: number; ogTitle: boolean; schemaTypes: string[]; textChars: number; faq: boolean;
};

function schemaTypes(html: string) {
  const types = new Set<string>();
  for (const m of Array.from(html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi))) {
    const walk = (o: any) => {
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o)) return o.forEach(walk);
      const t = o['@type']; if (t) ([] as string[]).concat(t).forEach((x) => types.add(String(x)));
      Object.values(o).forEach(walk);
    };
    try { walk(JSON.parse(m[1].trim())); } catch { const t = m[1].match(/"@type"\s*:\s*"([^"]+)"/g); t?.forEach((x) => types.add(x.split('"')[3])); }
  }
  if (/itemtype="https?:\/\/schema\.org\/(\w+)"/.test(html)) Array.from(html.matchAll(/itemtype="https?:\/\/schema\.org\/(\w+)"/g)).forEach((m) => types.add(m[1]));
  return Array.from(types);
}

export function checkPage(url: string, status: number, ms: number, html: string): PageCheck {
  const meta = (name: string) => decode(html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)`, 'i'))?.[1]
    ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${name}["']`, 'i'))?.[1] ?? '').trim();
  const imgs = Array.from(html.matchAll(/<img\b[^>]*>/gi)).map((m) => m[0]);
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const types = schemaTypes(html);
  return {
    url, status, ms, bytes: html.length,
    title: decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').replace(/\s+/g, ' ').trim(),
    description: meta('description'),
    canonical: html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)/i)?.[1] ?? html.match(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["']canonical["']/i)?.[1] ?? null,
    noindex: /noindex/i.test(meta('robots')),
    viewport: /<meta[^>]+name=["']viewport["']/i.test(html),
    lang: html.match(/<html[^>]+lang=["']([^"']+)/i)?.[1] ?? null,
    h1: (html.match(/<h1\b/gi) || []).length,
    images: imgs.length,
    imagesNoAlt: imgs.filter((i) => !/\balt=["'][^"']+["']/i.test(i)).length,
    ogTitle: !!meta('og:title'),
    schemaTypes: types,
    textChars: text.trim().length,
    faq: types.includes('FAQPage') || /常見問題|Q\s*&\s*A|FAQ/i.test(text),
  };
}

// 內頁挑選：優先產品、系列、分類頁
function pickLinks(html: string, base: string, max = 4) {
  const host = hostOf(base);
  const urls = new Set<string>();
  for (const m of Array.from(html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["']/gi))) {
    try {
      const u = new URL(decode(m[1]), base);
      if (hostOf(u.href) !== host || !/^https?:$/.test(u.protocol)) continue;
      if (/\.(jpg|png|pdf|zip|webp|svg)$|login|cart|account|signin|register|javascript:/i.test(u.pathname)) continue;
      urls.add(u.origin + u.pathname);
    } catch {}
  }
  const all = Array.from(urls).filter((u) => u.replace(/\/$/, '') !== base.replace(/\/$/, ''));
  const score = (u: string) => (/product|products|collections?|category|series|item|goods|shop|系列|商品/i.test(decodeURIComponent(u)) ? 0 : 1);
  return { count: all.length, picked: all.sort((a, b) => score(a) - score(b)).slice(0, max) };
}

const AI_BOTS = ['GPTBot', 'ChatGPT-User', 'OAI-SearchBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'CCBot'];
function blockedBots(robots: string) {
  const blocked: string[] = [];
  const groups = robots.split(/\n(?=\s*user-agent)/i);
  for (const g of groups) {
    const agents = Array.from(g.matchAll(/user-agent:\s*(.+)/gi)).map((m) => m[1].trim());
    const disallowAll = /\ndisallow:\s*\/\s*(\n|$)/i.test(g + '\n');
    if (!disallowAll) continue;
    for (const a of agents) {
      if (a === '*') blocked.push('*');
      else if (AI_BOTS.some((b) => b.toLowerCase() === a.toLowerCase())) blocked.push(a);
    }
  }
  return blocked;
}

export async function auditSite(url: string) {
  const base = /^https?:\/\//.test(url) ? url : 'https://' + url;
  const home = await get(base, 15000);
  const origin = (() => { try { return new URL(home.finalUrl || base).origin; } catch { return base; } })();
  const [robots, sitemap, llms] = await Promise.all([
    get(origin + '/robots.txt', 8000), get(origin + '/sitemap.xml', 10000), get(origin + '/llms.txt', 8000),
  ]);
  const homeCheck = checkPage(home.finalUrl || base, home.status, home.ms, home.text);
  const links = pickLinks(home.text, origin);
  const pages = await Promise.all(links.picked.map(async (u) => { const r = await get(u, 10000); return checkPage(u, r.status, r.ms, r.text); }));
  const robotsOk = robots.status === 200 && /user-agent/i.test(robots.text);
  const sitemapOk = sitemap.status === 200 && /<urlset|<sitemapindex/i.test(sitemap.text);
  const sitemapUrls = (sitemap.text.match(/<loc>/g) || []).length;
  const text = home.text.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
  return {
    origin, https: origin.startsWith('https://'), reachable: home.status === 200, status: home.status,
    home: homeCheck, pages, internalLinks: links.count,
    robots: { ok: robotsOk, blocked: robotsOk ? blockedBots(robots.text) : [], sitemapListed: /sitemap:/i.test(robots.text) },
    sitemap: { ok: sitemapOk || /sitemap:/i.test(robots.text), urls: sitemapUrls },
    llmsTxt: llms.status === 200 && llms.text.length > 20 && !/<html/i.test(llms.text.slice(0, 200)),
    contact: { phone: /(?:電話|客服|Tel)[^\d]{0,6}(?:\(?0\d{1,3}\)?[-\s]?\d{3,4}[-\s]?\d{3,4}|0800[-\s]?\d{3}[-\s]?\d{3})/i.test(text), address: /(?:地址|門市|櫃點|專櫃)[^<]{0,20}(?:[市縣][^<]{0,15}[路街道][^<]{0,10}號)/.test(text) },
  };
}
export type SiteResult = Awaited<ReturnType<typeof auditSite>>;
