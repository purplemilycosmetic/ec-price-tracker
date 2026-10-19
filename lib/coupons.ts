// 自動收集平台優惠券：
// - momo：官方「全站折價券」頁（直接讀，結構化：分類、面額或折數、低消、效期）
// - 蝦皮、酷澎：省錢網站 callingtaiwan.com.tw 每天更新的優惠整理（經 r.jina.ai 讀取）
// - 蝦皮：PTT 省錢板每天的「蝦皮優惠整理」（有各時段開搶時間）
import { adminDb, todayTaipei } from './db';
import type { Coupon } from './couponCalc';

type Raw = Omit<Coupon, 'id' | 'first_seen' | 'last_seen' | 'active' | 'product_key' | 'listing_id'> & { product_key?: string | null; listing_id?: number | null };
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
const num = (s?: string | null) => (s ? parseInt(s.replace(/[^\d]/g, ''), 10) : NaN);
const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
const pad = (n: number) => String(n).padStart(2, '0');
const base = (platform: string, source: string, title: string): Raw => ({
  platform, source, kind: 'platform', title, scope: 'all', scope_text: null, min_spend: 0, amount: null, rate: null, cap: null,
  start_date: null, end_date: null, start_time: null, limited: false, vip: false, new_user: false, bank: null, url: null, note: null,
});
// 「87 折」→ 0.87；「9 折」→ 0.9；「95 折」→ 0.95
const rateOf = (s: string) => { const n = parseFloat(s); return n >= 10 ? n / 100 : n / 10; };

async function get(url: string, timeout = 25000) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'zh-TW,zh;q=0.9' }, cache: 'no-store', signal: AbortSignal.timeout(timeout) });
  return { status: r.status, text: r.ok ? await r.text() : '' };
}

// ---------- momo 官方折價券頁 ----------
export function parseMomo(html: string, today: string): Raw[] {
  const out: Raw[] = [];
  for (const li of html.split(/<li class="PD_slide/).slice(1)) {
    const v = (id: number) => li.match(new RegExp(`id="js-PD_val_${id}"[^>]*>([^<]*)<`))?.[1]?.trim() ?? '';
    const cat = v(5), val = v(2), unit = v(3), money = v(1);
    const limit = li.match(/js-PD_txt1"[^>]*>([^<]*)</)?.[1]?.trim() ?? '';
    const tag = li.match(/js-PD_txt3"[^>]*>([^<]*)</)?.[1]?.trim() ?? '';
    const [s, e] = v(4).split('~').map((x) => x.trim());
    if (!val || val === '-' || !e || e < today) continue; // 沒有面額、已過期
    const c = base('momo', 'momo-official', `${cat} ${money}${val}${unit}${limit ? `（${limit}）` : ''}${tag ? ` ${tag}` : ''}`);
    if (/折/.test(unit)) c.rate = rateOf(val); else c.amount = num(val);
    c.min_spend = num(tag.match(/滿\s*([\d,]+)/)?.[1]) || 0;
    c.start_date = /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
    c.end_date = e;
    c.scope = /指定/.test(cat + limit) ? 'designated' : /美妝|保養/.test(cat) ? 'beauty' : /全站/.test(cat) ? 'all' : 'category';
    c.scope_text = c.scope === 'category' ? cat : limit || null;
    c.url = 'https://www.momoshop.com.tw/edm/cmmedm.jsp?lpn=O5k04sY5dth';
    out.push(c);
  }
  return out;
}

// ---------- callingtaiwan 優惠整理 ----------
export function parseCalling(md: string, platform: 'shopee' | 'coupang', pageUrl: string, today: string): Raw[] {
  const out: Raw[] = [];
  const year = +today.slice(0, 4);
  for (const block of md.split(/\n#{3,4}\s*👉\s*/).slice(1)) {
    const head = block.split('\n')[0].replace(/\*\*/g, '').trim();
    const br = head.match(/^【([^】]+)】\s*(?:\(([^)]+)\))?/);
    const tag = br?.[1] ?? '';
    const body = block.slice(0, 1200);
    if (/免運/.test(head) && !/折\s*\$/.test(head)) continue;
    // 優惠期限
    const dm = body.match(/優惠期限[：:]\s*(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
    let end = dm ? `${dm[1]}-${pad(+dm[2])}-${pad(+dm[3])}` : null;
    let start: string | null = null;
    const one = head.match(/(?:^|[】\s])(\d{1,2})\/(\d{1,2})\s/); // 「10/25 商城日」
    if (one) { start = `${year}-${pad(+one[1])}-${pad(+one[2])}`; end = end && end < start ? start : end ?? start; }
    if (end && end < today) continue;
    const mk = () => {
      const c = base(platform, 'callingtaiwan', head.replace(/^【[^】]+】\s*/, '').slice(0, 120));
      c.start_date = start; c.end_date = end; c.url = pageUrl;
      c.new_user = /新戶|首購|新客|新會員/.test(head);
      c.vip = /VIP|WOW\s*會員|會員/.test(head) && !/新會員/.test(head);
      c.limited = /限量|限\s*\d+\s*名|兌完為止/.test(body);
      if (/信用卡|銀行|卡\)/.test(tag + head)) { c.kind = 'bank'; c.bank = br?.[2] ?? tag; }
      c.scope = /商城/.test(tag + head) ? 'mall' : /直送|直營/.test(tag) ? 'direct' : 'all';
      if (/美妝/.test(head)) c.scope = 'beauty';
      const rest = head.replace(/^【[^】]+】\s*/, '');
      const brand = rest.match(/^([^｜|]+)[｜|]/);
      const brand2 = rest.match(/^([^：:]+?)\s*(?:商品)?[：:]\s*(\S+)\s*(?:消費)?滿/); // 「P&G 商品：幫寶適/好自在 消費滿…」
      if (brand && !/美妝/.test(brand[1])) { c.scope = 'brand'; c.scope_text = brand[1].replace(/商品[:：]?/, '').trim(); }
      else if (brand2 && !/\d+\/\d+|商城日|會員日|全站|全館|美妝/.test(brand2[1])) { c.scope = 'brand'; c.scope_text = `${brand2[1].trim()}/${brand2[2]}`; }
      else if (/指定商品|指定品/.test(head)) c.scope = 'designated';
      return c;
    };
    // 多段門檻：滿 $899/$1,200/$2,000 折 $40/$60/$200
    const tiers = head.match(/滿\s*\$?([\d,]+(?:\s*\/\s*\$?[\d,]+)+)\s*折\s*\$?([\d,]+(?:\s*\/\s*\$?[\d,]+)+)/);
    if (tiers) {
      const mins = tiers[1].split('/').map(num), amts = tiers[2].split('/').map(num);
      mins.forEach((m, i) => { if (amts[i]) { const c = mk(); c.min_spend = m; c.amount = amts[i]; c.title = `${c.title}（滿 $${m} 折 $${amts[i]}）`; out.push(c); } });
      continue;
    }
    const c = mk();
    const h2 = head.replace(/最高折(?:抵)?\s*\$?\s*[\d,]+\s*元?/g, ''); // 「最高折 $200」是上限，不是面額
    const amt = h2.match(/(?:滿\s*\$?([\d,]+)\s*)?(?:元\s*)?折\s*\$\s*([\d,]+)/) || h2.match(/(不限金額)\s*折\s*\$?\s*([\d,]+)/);
    const pct = h2.match(/(?:滿\s*\$?([\d,]+)\s*)?(?:享\s*)?(\d{1,2}(?:\.\d)?)\s*折(?!\s*\$)(?!起)/);
    const cap = head.match(/最高折(?:抵)?\s*\$?\s*([\d,]+)/);
    if (amt) { c.amount = num(amt[2]); c.min_spend = num(amt[1]) || 0; }
    else if (pct) { c.rate = rateOf(pct[2]); c.min_spend = num(pct[1]) || 0; if (cap) c.cap = num(cap[1]); }
    else continue; // 「3 折起」「每日低價」這類不是券
    out.push(c);
  }
  return out;
}

// ---------- PTT 省錢板「蝦皮優惠整理」 ----------
export function parsePttShopee(text: string, day: string): Raw[] {
  const body = text.split(/※ 發信站|--\s*※/)[0];
  const out = new Map<string, Raw>();
  let time: string | null = null;
  const re = /(\d{1,2}:\d{2}(?:\s*[、,]\s*\d{1,2}:\d{2})*)|(商城|全站|直營)\s*(VIP\s*)?(\d{2,5})\s*-\s*(\d{1,5})(\s*[\(（]\s*(?:兩|二|三|\d)\s*張\s*[\)）])?|(商城|全站|直營)\s*(VIP\s*)?(\d{1,2}(?:\.\d)?)\s*折\s*[\(（]\s*低消\s*(\d+)\s*[,，]\s*上限折?\s*(\d+)\s*[\)）]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    if (m[1]) { time = m[1].replace(/\s/g, ''); continue; }
    const scopeWord = m[2] || m[7];
    const vip = !!(m[3] || m[8]);
    const c = base('shopee', 'ptt', '');
    c.scope = scopeWord === '商城' ? 'mall' : scopeWord === '直營' ? 'direct' : 'all';
    c.vip = vip; c.limited = true; c.start_date = day; c.end_date = day; c.start_time = time;
    if (m[2]) { c.min_spend = +m[4]; c.amount = +m[5]; c.title = `${scopeWord}${vip ? ' VIP' : ''} 滿 $${c.min_spend} 折 $${c.amount}`; }
    else { c.rate = rateOf(m[9]); c.min_spend = +m[10]; c.cap = +m[11]; c.title = `${scopeWord}${vip ? ' VIP' : ''} ${m[9]} 折（低消 $${c.min_spend}，上限折 $${c.cap}）`; }
    if (c.amount != null && c.amount >= c.min_spend && c.min_spend > 0) continue; // 「100-50」這種合理，「50-100」不合理
    const k = c.title;
    const prev = out.get(k);
    if (prev) { if (time && !(prev.start_time || '').includes(time)) prev.start_time = [prev.start_time, time].filter(Boolean).join('、'); }
    else out.set(k, c);
  }
  return Array.from(out.values());
}

async function pttShopeePosts(today: string) {
  const r = await get('https://www.pttweb.cc/bbs/Lifeismoney', 12000);
  if (r.status !== 200) return { status: r.status, posts: [] as { id: string; day: string; title: string }[] };
  const posts: { id: string; day: string; title: string }[] = [];
  const year = +today.slice(0, 4);
  for (const c of r.text.split('class="e7-container"').slice(1)) {
    const id = c.match(/\/bbs\/Lifeismoney\/(M\.\d+\.A\.[0-9A-F]+)"/)?.[1];
    const title = c.match(/e7-show-if-device-is-not-xs[^>]*><span[^>]*>([^<]*)<\/span>/)?.[1] ?? '';
    const d = title.match(/(\d{1,2})\/(\d{1,2})/);
    if (!id || !d || !/蝦皮/.test(title) || !/優惠|整理|券/.test(title) || /^Re:/.test(title)) continue;
    const day = `${year}-${pad(+d[1])}-${pad(+d[2])}`;
    if (day >= today && !posts.some((p) => p.id === id)) posts.push({ id, day, title });
  }
  return { status: 200, posts: posts.slice(0, 3) };
}

export async function runCoupons() {
  const db = adminDb();
  const today = todayTaipei();
  const stats: Record<string, number | string> = {};
  const found: Raw[] = [];
  const jobs: [string, () => Promise<Raw[]>][] = [
    ['momo', async () => { const r = await get('https://www.momoshop.com.tw/edm/cmmedm.jsp?lpn=O5k04sY5dth', 15000); return r.status === 200 ? parseMomo(r.text, today) : Promise.reject(r.status); }],
    ['shopee', async () => {
      const u = 'https://www.callingtaiwan.com.tw/蝦皮折扣碼-shopee/';
      const r = await get('https://r.jina.ai/' + u); return r.status === 200 ? parseCalling(r.text, 'shopee', u, today) : Promise.reject(r.status);
    }],
    ['coupang', async () => {
      const u = 'https://www.callingtaiwan.com.tw/coupang酷澎優惠碼和使用教學/';
      const r = await get('https://r.jina.ai/' + u); return r.status === 200 ? parseCalling(r.text, 'coupang', u, today) : Promise.reject(r.status);
    }],
    ['ptt', async () => {
      const { posts } = await pttShopeePosts(today);
      const all: Raw[] = [];
      for (const p of posts) {
        const url = `https://www.ptt.cc/bbs/Lifeismoney/${p.id}.html`;
        const r = await get('https://r.jina.ai/' + url);
        if (r.status === 200) all.push(...parsePttShopee(r.text, p.day).map((c) => ({ ...c, url, note: p.title })));
      }
      return all;
    }],
  ];
  await Promise.all(jobs.map(async ([name, fn]) => {
    try { const rows = await fn(); stats[name] = rows.length; found.push(...rows); } catch (e) { stats[name] = `失敗 ${String(e).slice(0, 40)}`; }
  }));
  const rows = Array.from(new Map(found.map((c) => {
    const id = c.source + '-' + hash([c.platform, c.title, c.min_spend, c.amount, c.rate, c.start_date, c.end_date].join('|'));
    return [id, { ...c, id, last_seen: today, active: true }];
  })).values());
  // 不帶 first_seen：新券用今天，舊券保留第一次看到的日期
  if (rows.length) {
    const { error } = await db.from('ec_coupons').upsert(rows, { onConflict: 'id' });
    if (error) stats.error = error.message;
  }
  stats.total = rows.length;
  return stats;
}
