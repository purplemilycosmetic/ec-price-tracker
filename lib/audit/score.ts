// 品牌健檢評分與報告文字（規則產生，每一句都對應到實際檢查結果）
import type { SiteResult, PageCheck } from './site';
import type { SpeedResult } from './speed';
import type { SearchResult } from './search';
import type { SocialResult } from './social';
import type { AiResult } from './ai';
import type { SourcesResult } from './sources';

export type Parts = { site?: SiteResult; speed?: SpeedResult; search?: SearchResult; social?: SocialResult; ai?: AiResult; sources?: SourcesResult };
export type Dim = { key: string; name: string; score: number; note: string; weight: number; estimated?: boolean };

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const pct = (a: number, b: number) => (b ? a / b : 0);

export const GRADES = [
  { min: 75, grade: 'A', label: 'AI 推薦力良好，持續擴大優勢' },
  { min: 55, grade: 'B', label: '具備基礎，補強選購內容與外部聲量' },
  { min: 35, grade: 'C', label: '存在感偏弱，需優先補齊' },
  { min: 0, grade: 'D', label: '幾乎不在 AI 推薦名單，需立即趕工' },
];

function pageOk(p: PageCheck) {
  const checks = [p.status === 200, p.title.length >= 5 && p.title.length <= 70, p.description.length >= 30, !!p.canonical, !p.noindex, p.viewport, p.h1 >= 1, p.images === 0 || p.imagesNoAlt / p.images <= 0.2];
  return checks.filter(Boolean).length / checks.length;
}

export function scoreAudit(brand: string, category: string, parts: Parts) {
  const { site, speed, search, social, ai, sources } = parts;
  const read = (sources?.articles ?? []).filter((x) => x.ok);
  const cited = read.filter((x) => x.mentioned);
  const pages = site ? [site.home, ...site.pages].filter((p) => p.status === 200) : [];
  const brandTokens = brand.split(/[\s／/|（）()]+/).map((x) => x.toLowerCase().replace(/[-.\s]/g, '')).filter((x) => /^[a-z0-9]{4,}$/.test(x));
  const types = new Set(pages.flatMap((p) => p.schemaTypes));
  const has = (...t: string[]) => t.some((x) => types.has(x));
  const avgText = pages.length ? pages.reduce((a, p) => a + p.textChars, 0) / pages.length : 0;
  const dims: Dim[] = [];

  // 1 官網 SEO 結構
  const pageScore = pages.length ? pages.reduce((a, p) => a + pageOk(p), 0) / pages.length : 0;
  dims.push({ key: 'seo', name: '官網 SEO 結構', weight: 15,
    score: site?.reachable ? clamp(pageScore * 50 + (site.robots.ok ? 10 : 0) + (site.sitemap.ok ? 10 : 0) + (site.https ? 5 : 0)
      + (new Set(pages.map((p) => p.title)).size === pages.length ? 10 : 0) + (has('Product', 'ProductGroup') ? 15 : 0)) : 0,
    note: site?.reachable ? `抽查 ${pages.length} 頁，基本標籤達成率 ${Math.round(pageScore * 100)}%；robots.txt ${site.robots.ok ? '有' : '沒有'}、sitemap ${site.sitemap.ok ? '有' : '沒有'}。` : `官網無法讀取（HTTP ${site?.status ?? '—'}）。` });

  // 2 AI 可讀性
  const blocked = site?.robots.blocked ?? [];
  dims.push({ key: 'readable', name: 'AI 可讀性', weight: 15,
    score: site?.reachable ? clamp((site.home.textChars >= 800 ? 25 : site.home.textChars >= 300 ? 12 : 0) + (has('Organization', 'Corporation', 'WebSite', 'Brand') ? 15 : 0)
      + (has('Product', 'ProductGroup', 'Offer') ? 20 : 0) + (blocked.length ? 0 : 20) + (site.llmsTxt ? 10 : 0) + (site.home.lang ? 5 : 0) + (site.home.ogTitle ? 5 : 0)) : 0,
    note: site?.reachable ? `首頁可讀文字約 ${site.home.textChars.toLocaleString()} 字；結構化資料：${types.size ? Array.from(types).slice(0, 6).join('、') : '無'}；${blocked.length ? `robots.txt 擋了 ${blocked.join('、')}` : '沒有阻擋 AI 爬蟲'}；llms.txt ${site.llmsTxt ? '有' : '沒有'}。` : '官網無法讀取。' });

  // 3 在地與商家資訊（無法直接查 Google 商家檔案，以官網上的資訊判斷）
  dims.push({ key: 'local', name: '在地／商家資訊', weight: 5, estimated: true,
    score: site?.reachable ? clamp((has('LocalBusiness', 'Store', 'HealthAndBeautyBusiness') ? 40 : 0) + (site.contact.address ? 30 : 0) + (site.contact.phone ? 30 : 0)) : 0,
    note: `（推估）官網${site?.contact.address ? '有' : '沒有'}門市地址、${site?.contact.phone ? '有' : '沒有'}客服電話、${has('LocalBusiness', 'Store') ? '有' : '沒有'}商家結構化資料；未直接查 Google 商家檔案。` });

  // 4 第三方媒體
  const brandHits = (search?.queries ?? []).filter((q) => q.type === 'brand').flatMap((q) => q.hits).filter((h) => h.brand);
  // 品牌自己的其他網域（例如香港官網）不算第三方；個人部落格權重較低
  const own = (h: string) => brandTokens.some((t) => h.replace(/[-.]/g, '').includes(t));
  const third = brandHits.filter((h) => (h.kind === 'media' || h.kind === 'wiki') && !own(h.host));
  const blog = (h: string) => /pixnet|blogspot|wordpress|medium|vocus|matters|blog\./.test(h);
  const mediaHosts = Array.from(new Set(third.filter((h) => !blog(h.host)).map((h) => h.host)));
  const blogHosts = Array.from(new Set(third.filter((h) => blog(h.host)).map((h) => h.host)));
  dims.push({ key: 'media', name: '第三方媒體', weight: 10,
    score: clamp(Math.min(60, mediaHosts.length * 8 + blogHosts.length * 4) + (read.length ? (cited.length / read.length) * 40 : 0)),
    note: `品牌搜尋前段有 ${mediaHosts.length} 個媒體網站${mediaHosts.length ? `（${mediaHosts.slice(0, 4).join('、')}）` : ''}、${blogHosts.length} 個個人部落格；${read.length ? `「${category}」推薦文章 ${read.length} 篇中有 ${cited.length} 篇提到品牌。` : '沒有讀到推薦文章。'}` });

  // 5 社群口碑
  const nonVideo = (social?.sites ?? []).filter((s) => !s.video);
  dims.push({ key: 'social', name: '社群口碑', weight: 10,
    // 只看近一年的貼文，舊文章不能代表現在的口碑
    score: clamp(nonVideo.filter((s) => s.recent > 0).length * 8 + Math.min(40, nonVideo.reduce((a, s) => a + s.recent, 0) * 3) + Math.min(20, (social?.forum ?? 0) * 4)),
    note: social ? `近一年被收錄的相關貼文（每平台最多看 10 筆）：${nonVideo.map((s) => `${s.name} ${s.recent}`).join('、')}；本站論壇近 90 天提及 ${social.forum} 篇。` : '尚未檢查。' });

  // 6 影音內容
  const video = (social?.sites ?? []).filter((s) => s.video);
  dims.push({ key: 'video', name: '影音內容', weight: 5,
    score: clamp(video.reduce((a, s) => a + (s.recent > 0 ? 15 : 0) + Math.min(35, s.recent * 6), 0)),
    note: video.length ? `近一年被收錄的相關影片（每平台最多看 10 筆）：${video.map((s) => `${s.name} ${s.recent}`).join('、')}。` : '尚未檢查。' });

  // 7 AI 推薦潛力
  const rec = (search?.queries ?? []).filter((q) => q.type === 'recommend');
  const recHit = rec.filter((q) => q.hits.some((h) => h.brand));
  const recTop3 = rec.filter((q) => q.hits.slice(0, 3).some((h) => h.brand));
  let aiScore: number, aiNote: string, aiEstimated = false;
  if (ai?.enabled) {
    const r = ai.answers.filter((a) => a.type === 'recommend' && a.ok);
    const k = ai.answers.filter((a) => a.type === 'knowledge' && a.ok);
    aiScore = clamp(pct(r.filter((a) => a.mentioned).length, r.length) * 80 + pct(k.filter((a) => a.mentioned).length, k.length) * 20);
    aiNote = `問 Gemini ${r.length} 題選購推薦，${r.filter((a) => a.mentioned).length} 題有提到品牌；品牌知識題 ${k.filter((a) => a.mentioned).length}/${k.length} 題能正確回答到品牌。`;
  } else {
    aiEstimated = true;
    aiScore = rec.length ? clamp(pct(recHit.length, rec.length) * 30 + pct(recTop3.length, rec.length) * 20 + (read.length ? pct(cited.length, read.length) * 50 : 0)) : 0;
    aiNote = rec.length ? `（推估）未設定 AI 金鑰，改用 AI 常引用的來源判斷：「${category}」推薦搜尋前 10 筆標題中 ${recHit.length}/${rec.length} 次有品牌；排名前面的推薦文章 ${read.length} 篇中 ${cited.length} 篇提到品牌。` : '未填主要品類，無法測試選購推薦情境。';
  }
  dims.push({ key: 'ai', name: 'AI 推薦潛力', weight: 20, score: aiScore, note: aiNote, estimated: aiEstimated });

  // 8 SERP 品牌覆蓋率
  const bq = (search?.queries ?? []).find((q) => q.type === 'brand');
  const rank = bq ? bq.hits.findIndex((h) => h.kind === 'official') + 1 : 0;
  const relevant = bq ? bq.hits.filter((h) => h.brand).length : 0;
  dims.push({ key: 'serp', name: 'SERP 品牌覆蓋率', weight: 10,
    score: clamp((rank === 1 ? 40 : rank === 2 ? 32 : rank === 3 ? 26 : rank > 0 ? 15 : 0) + pct(relevant, Math.max(bq?.hits.length ?? 0, 1)) * 60),
    note: bq ? `搜尋「${bq.q}」：官網${rank ? `排第 ${rank}` : '未進前 10'}，前 ${bq.hits.length} 筆有 ${relevant} 筆與品牌相關。` : '尚未檢查。' });

  // 9 GEO／AEO 能力
  const faq = pages.some((p) => p.faq);
  dims.push({ key: 'geo', name: 'GEO／AEO 能力', weight: 10,
    score: site?.reachable ? clamp((faq ? 25 : 0) + (has('FAQPage') ? 15 : 0) + (has('Product', 'ProductGroup') ? 15 : 0) + (site.llmsTxt ? 10 : 0)
      + (avgText >= 1500 ? 20 : avgText >= 700 ? 10 : 0) + (has('BreadcrumbList') ? 5 : 0) + (pages.filter((p) => p.description.length >= 30).length >= pages.length * 0.7 ? 10 : 0)) : 0,
    note: site?.reachable ? `${faq ? '有' : '沒有'}常見問題內容、${has('FAQPage') ? '有' : '沒有'} FAQ 結構化資料；內頁平均可讀文字約 ${Math.round(avgText).toLocaleString()} 字。` : '官網無法讀取。' });

  const total = clamp(dims.reduce((a, d) => a + d.score * d.weight, 0) / dims.reduce((a, d) => a + d.weight, 0));
  const g = GRADES.find((x) => total >= x.min)!;

  // ---- 官網檢查：做得好／不好／AI 解讀風險 ----
  const good: string[] = [], bad: string[] = [], risk: string[] = [];
  if (site?.reachable) {
    const noindex = pages.filter((p) => p.noindex).length, noCanon = pages.filter((p) => !p.canonical).length, noDesc = pages.filter((p) => p.description.length < 30);
    (noindex ? bad : good).push(noindex ? `${noindex} 個抽查頁面設了 noindex，搜尋引擎與 AI 不會收錄` : '抽查頁面都沒有設 noindex');
    (noCanon ? bad : good).push(noCanon ? `${noCanon} 個頁面缺少 canonical 標籤` : '抽查頁面都有 canonical 標籤');
    (noDesc.length ? bad : good).push(noDesc.length ? `${noDesc.length} 個頁面缺少或過短的搜尋描述（例如 ${decodeURIComponent(noDesc[0].url).slice(0, 60)}）` : '抽查頁面都有搜尋描述');
    if (pages.every((p) => p.viewport)) good.push('都有行動版設定');
    const altMiss = pages.reduce((a, p) => a + p.imagesNoAlt, 0), imgs = pages.reduce((a, p) => a + p.images, 0);
    if (imgs) (altMiss / imgs > 0.2 ? bad : good).push(altMiss / imgs > 0.2 ? `${altMiss}/${imgs} 張圖片沒有替代文字（alt），AI 看不懂圖片內容` : '圖片大多有替代文字（alt）');
    if (!has('Product', 'ProductGroup')) bad.push('產品頁沒有 Product 結構化資料，AI 不容易讀到品名、規格、價格');
    else good.push('有 Product 結構化資料');
    if (!faq) bad.push('沒有常見問題（FAQ）內容，AI 缺少可直接引用的選購答案');
    if (site.home.textChars < 800) risk.push(`首頁伺服器端只讀得到約 ${site.home.textChars} 字，內容可能靠 JavaScript 產生，部分 AI 爬蟲讀不到`);
    if (blocked.length) risk.push(`robots.txt 阻擋了 ${blocked.join('、')}，這些 AI 無法讀取官網`);
    if (!site.llmsTxt) risk.push('沒有 llms.txt（給 AI 看的網站導覽），屬加分項目');
    const titles = pages.map((p) => p.title);
    if (new Set(titles).size < titles.length) risk.push('多個頁面使用相同標題，AI 較難區分各系列用途');
    if (!site.sitemap.ok) bad.push('沒有找到 sitemap.xml，新頁面較慢被收錄');
  }
  const fb = (speed as any)?.fallback as { ms: number; kb: number; scripts: number } | undefined;
  if (!speed?.ok && fb) (fb.ms > 2500 || fb.kb > 500 || fb.scripts > 40 ? bad : good).push(`首頁回應 ${(fb.ms / 1000).toFixed(1)} 秒、HTML ${fb.kb} KB、${fb.scripts} 個程式檔（簡易量測）`);
  if (speed?.ok) {
    const lcp = (speed.lcp ?? 0) / 1000, cls = speed.cls ?? 0;
    ((speed.performance ?? 0) < 50 || lcp > 4 || cls > 0.25 ? bad : good).push(`手機版速度分數 ${speed.performance}／100，LCP ${lcp.toFixed(1)} 秒、CLS ${cls.toFixed(3)}`);
  }

  // ---- 最大問題點：分數最低的 4 項 ----
  const issues = [...dims].sort((a, b) => a.score - b.score).slice(0, 4).map((d) => ({ name: d.name, score: d.score, text: d.note }));

  // ---- 90 天建議 ----
  const s = (k: string) => dims.find((d) => d.key === k)!.score;
  const stages = [
    { stage: 'STAGE 01 / 0–30 天', title: '官網結構與 AI 讀取', items: [
      ...(bad.filter((b) => /noindex|canonical|描述|alt|sitemap/.test(b)).map((b) => `修正：${b}`)),
      ...(!has('Product', 'ProductGroup') ? ['產品頁加上 Product 結構化資料（品名、品牌、規格、價格、評價）'] : []),
      ...(!has('Organization', 'Brand') ? ['首頁加上 Organization／Brand 結構化資料與官方社群連結'] : []),
      ...(blocked.length ? [`robots.txt 開放 ${blocked.join('、')}`] : []), ...(!site?.llmsTxt ? ['新增 llms.txt，列出品牌介紹、主力系列與選購指南'] : []),
      ...(speed?.ok && (speed.performance ?? 0) < 50 ? ['壓縮首頁圖片、延後載入非必要程式，改善手機版速度'] : []),
    ].slice(0, 5) },
    { stage: 'STAGE 02 / 30–60 天', title: '選購答案內容', items: [
      ...(!faq ? ['每個系列補上常見問題：適合什麼膚質、怎麼用、和其他系列差在哪'] : []),
      `建立「${brand} 怎麼選」「${brand} ${category || '系列'}比較」等選購指南頁`,
      ...(category ? [`針對「${category} 推薦」寫出能被引用的比較內容（成分、質地、適用情境、價格帶）`] : []),
      '產品頁補齊可查證的資訊：成分、檢驗、使用前後說明',
    ] },
    { stage: 'STAGE 03 / 60–90 天', title: '第三方媒體與平台信任', items: [
      ...(s('media') < 50 ? ['爭取美妝媒體評測與編輯推薦，並標示合作關係'] : ['維持媒體曝光，更新過時的評測資訊']),
      '在 momo、蝦皮商城等通路頁使用一致的品名與規格，方便 AI 對照',
      ...(s('local') < 50 ? ['官網補上門市／專櫃資訊與客服電話，建立或更新 Google 商家檔案'] : []),
    ] },
    { stage: 'STAGE 04 / 90 天+', title: '影音與社群需求驗證', items: [
      ...(s('video') < 50 ? ['製作選購短影音並附逐字稿（YouTube、TikTok）'] : []),
      ...(s('social') < 50 ? ['經營 Dcard、Threads 上的真實使用心得與問答'] : ['持續追蹤社群口碑與負評回應']),
      '每月用相同的推薦問題重新健檢，追蹤品牌是否開始被提及',
    ] },
  ];

  // ---- 關鍵字 ----
  const tested = new Map((search?.queries ?? []).map((q) => [q.q, q]));
  const kw = [
    ...(category ? [`${category} 推薦`, `台灣 ${category} 推薦 品牌`, `${category} 比較 評價`] : []),
    `${brand} 怎麼選`, `${brand} ${category || '系列'} 比較`, `${brand} 哪裡買`, `${brand} 評價`,
  ].map((k) => {
    const q = tested.get(k);
    return { keyword: k, status: q ? (q.hits.some((h) => h.brand) ? '已出現' : '未出現') : '待驗證', note: q ? (q.hits.some((h) => h.brand) ? `前 10 筆有品牌（第 ${q.hits.findIndex((h) => h.brand) + 1} 筆）` : '前 10 筆沒有品牌，值得搶') : (/怎麼選|比較/.test(k) ? '選購轉換詞，適合做比較指南' : /哪裡買/.test(k) ? '彙整官方通路，協助完成購買' : '品牌口碑詞') };
  });

  // ---- 結論 ----
  const weakest = issues.slice(0, 2).map((i) => i.name).join('、');
  const quick = `${brand} 綜合 ${total} 分（${g.grade} 級）。${dims.find((d) => d.key === 'ai')!.note} 目前最弱的是${weakest}，${g.label}。`;
  const summary = {
    overall: [rank ? `品牌搜尋有入口（官網排第 ${rank}），${s('ai') < 40 ? '但選購推薦情境中仍少見' : '推薦情境已有一定曝光'}。` : '品牌搜尋時官網不在前段，先確保品牌字能找到官網。',
      `綜合分數 ${total}／100，${g.label}。`],
    problems: issues.map((i) => `${i.name}（${i.score} 分）：${i.text}`),
    direction: ['讓每個系列清楚回答「適合誰、怎麼選」。', '讓評測與產品依據能被交叉查證。', '讓官網、通路與社群提供一致的品牌資訊。'],
  };
  return { score: total, grade: g.grade, gradeLabel: g.label, dims, good, bad, risk, issues, stages, keywords: kw, quick, summary };
}
export type Scored = ReturnType<typeof scoreAudit>;
