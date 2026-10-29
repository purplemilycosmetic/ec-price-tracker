// AI 能見度：有 GEMINI_API_KEY 時直接問 Gemini（免費額度）；沒有金鑰時用搜尋結果當替代指標（在 score.ts 計算）
import { mentionsBrand, BEAUTY_BRANDS } from './common';

export function aiPrompts(brand: string, category: string) {
  const c = category || '保養品';
  return [
    { type: 'recommend', q: `我住在台灣，想買${c}，請推薦 5 個品牌並簡短說明理由。` },
    { type: 'recommend', q: `台灣買得到、CP 值高的${c}有哪些？請列出品牌。` },
    { type: 'recommend', q: `請比較台灣市面上熱門的${c}品牌，各自適合什麼膚質？` },
    { type: 'knowledge', q: `${brand} 是什麼品牌？主打哪些產品？在哪裡買得到？` },
    { type: 'knowledge', q: `${brand} 的${c}值得買嗎？優缺點是什麼？` },
  ];
}

async function askGemini(q: string, key: string) {
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const call = (tools: boolean) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(40000),
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: q }] }], ...(tools ? { tools: [{ google_search: {} }] } : {}), generationConfig: { temperature: 0.4, maxOutputTokens: 900 } }),
  });
  // 先用「搜尋＋回答」模式（最接近使用者實際看到的），額度用完時改用一般模式
  let r = await call(true);
  let grounded = true;
  if (!r.ok) { r = await call(false); grounded = false; }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, text: '', grounded, error: j?.error?.message ?? `HTTP ${r.status}`, sources: [] as string[] };
  const text = (j.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || '').join('');
  const sources = (j.candidates?.[0]?.groundingMetadata?.groundingChunks || []).map((c: any) => c.web?.title || c.web?.uri).filter(Boolean);
  return { ok: true, text, grounded, sources };
}

export async function auditAi(brand: string, aliases: string[], category: string) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { enabled: false as const };
  const prompts = aiPrompts(brand, category);
  const answers = await Promise.all(prompts.map(async (p, i) => {
    await new Promise((ok) => setTimeout(ok, i * 700));
    const a = await askGemini(p.q, key).catch((e) => ({ ok: false, text: '', grounded: false, error: String(e), sources: [] as string[] }));
    const others = BEAUTY_BRANDS.filter((b) => a.text.toLowerCase().includes(b.toLowerCase()) && !mentionsBrand(b, aliases));
    return { ...p, ...a, mentioned: a.ok && mentionsBrand(a.text, aliases), others: Array.from(new Set(others)).slice(0, 10), text: a.text.slice(0, 2500) };
  }));
  return { enabled: true as const, model: process.env.GEMINI_MODEL || 'gemini-2.5-flash', answers };
}
export type AiResult = Awaited<ReturnType<typeof auditAi>>;
