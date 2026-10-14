// 使用者自建的追蹤產品（可同時追蹤 momo、蝦皮、酷澎）
import { adminDb } from './db';

export type UserProduct = { key: string; brand: string | null; name: string; short: string; queries: string[]; active: boolean };
export const isUserKey = (k?: string | null) => !!k && /^u-[a-z0-9]+$/.test(k);

export async function loadUserProducts(includeInactive = false): Promise<UserProduct[]> {
  try {
    let q = adminDb().from('ec_custom_products').select('*').order('created_at');
    if (!includeInactive) q = q.eq('active', true);
    const { data } = await q;
    return (data || []) as UserProduct[];
  } catch { return []; }
}
