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
