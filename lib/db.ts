import { createClient } from '@supabase/supabase-js';

// 伺服器端用 service role（可寫入）；只在 API route / server component 使用
export function adminDb() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

export function todayTaipei() {
  return new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
}

// Supabase 每次最多回傳 1000 筆；歷史資料會越來越多，所以分頁讀完
export async function fetchAll<T = any>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>, max = 50000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < max; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export function addDays(day: string, n: number) {
  const d = new Date(day + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
