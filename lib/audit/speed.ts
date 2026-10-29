// 首頁速度：Google PageSpeed Insights（免費 API；有 PSI_API_KEY 時額度較高）
import { get } from './common';

export async function auditSpeed(url: string) {
  const key = process.env.PSI_API_KEY ? `&key=${process.env.PSI_API_KEY}` : '';
  const r = await get(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile&category=performance&locale=zh-TW${key}`, 55000);
  if (r.status !== 200) return { ok: false, status: r.status, error: r.text.slice(0, 200) };
  try {
    const j = JSON.parse(r.text);
    const a = j.lighthouseResult?.audits || {};
    const n = (k: string) => a[k]?.numericValue ?? null;
    return {
      ok: true, status: 200,
      performance: Math.round((j.lighthouseResult?.categories?.performance?.score ?? 0) * 100),
      lcp: n('largest-contentful-paint'), cls: n('cumulative-layout-shift'), tbt: n('total-blocking-time'), fcp: n('first-contentful-paint'),
      field: j.loadingExperience?.overall_category ?? null,
    };
  } catch (e) { return { ok: false, status: r.status, error: String(e) }; }
}
export type SpeedResult = Awaited<ReturnType<typeof auditSpeed>>;
