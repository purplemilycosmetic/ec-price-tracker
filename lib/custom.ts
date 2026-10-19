// 使用者自建的追蹤產品（可同時追蹤 momo、蝦皮、酷澎）
import { adminDb } from './db';
import { normalize } from './classify';

export type UserProduct = {
  key: string; brand: string | null; name: string; short: string; active: boolean;
  queries: string[];  // 每天在 momo、BigGo 搜尋用的關鍵字
  must: string[];     // 商品標題必須包含的字（全部都要有）；有設定才會自動加入新找到的商品頁
  exclude: string[];  // 標題出現就排除的字
};
export const isUserKey = (k?: string | null) => !!k && /^u-[a-z0-9]+$/.test(k);

export async function loadUserProducts(includeInactive = false): Promise<UserProduct[]> {
  try {
    let q = adminDb().from('ec_custom_products').select('*').order('created_at');
    if (!includeInactive) q = q.eq('active', true);
    const { data } = await q;
    return (data || []) as UserProduct[];
  } catch { return []; }
}

// 停止追蹤的產品（內建產品、自訂追蹤）；自建產品用 ec_custom_products.active 控制
export async function loadHidden(): Promise<Set<string>> {
  try {
    const { data } = await adminDb().from('ec_hidden_products').select('key');
    return new Set((data || []).map((d) => d.key as string));
  } catch { return new Set(); }
}

// 搜尋到的商品標題是否符合自建產品的條件（大小寫、全半形都不影響）
const norm = (t: string) => normalize(t).toLowerCase().replace(/\s+/g, '');
export function matchesRule(title: string, u: Pick<UserProduct, 'must' | 'exclude'>) {
  if (!u.must?.length) return false;
  const t = norm(title);
  return u.must.every((w) => t.includes(norm(w))) && !(u.exclude || []).some((w) => w && t.includes(norm(w)));
}
// 文字欄位轉成清單：逗號、頓號、換行分隔；條件欄位也接受空白分隔
export const toList = (v: unknown, spaces = false) =>
  (Array.isArray(v) ? v.map(String) : String(v ?? '').split(spaces ? /[\s,，、;；]+/ : /[,，、;；\n]+/))
    .map((x) => x.trim()).filter(Boolean).slice(0, 12);
