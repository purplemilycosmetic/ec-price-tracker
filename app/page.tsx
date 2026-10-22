import { adminDb, todayTaipei, fetchAll } from '@/lib/db';
import { cleanNews, eventStatus } from '@/lib/news';
import { loadUserProducts, loadHidden } from '@/lib/custom';
import Dashboard, { type Listing, type Snap, type PlatformEvent, type OfficialProduct } from './Dashboard';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function Page() {
  const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'ADMIN_KEY', 'CRON_SECRET'].filter((k) => !process.env[k]);
  if (missing.length)
    return (
      <div className="page">
        <h1 className="display">網站尚未設定完成</h1>
        <p>網站還沒設定完成，Vercel 缺少這些環境變數：<b>{missing.join('、')}</b></p>
        <p className="muted">到 Vercel 專案 → Settings → Environment Variables 加入後，再到 Deployments 按 Redeploy。</p>
      </div>
    );
  const db = adminDb();
  const dayMs = 86400_000;
  const nowTw = Date.now() + 8 * 3600_000;
  const since = new Date(nowTw - 45 * dayMs).toISOString().slice(0, 10);
  const recent = new Date(nowTw - 3 * dayMs).toISOString().slice(0, 10);
  const newsSince = new Date(Date.now() - 21 * dayMs).toISOString();
  const [userProducts, hidden] = await Promise.all([loadUserProducts(), loadHidden()]);
  const [{ data: listings }, snaps, { data: banks }, { data: news }, { data: officials }, { data: coupons }] = await Promise.all([
    db.from('ec_listings').select('id,brand,line,spec,platform,url,title,image_url').eq('active', true),
    fetchAll((a, b) => db.from('ec_price_snapshots')
      .select('listing_id,captured_on,status,list_price,sale_price,final_price,promos,in_stock,error')
      .gte('captured_on', since).order('captured_on').order('id').range(a, b)),
    db.from('ec_platform_events').select('*').eq('kind', 'bank').gte('last_seen', recent).order('id'),
    db.from('ec_platform_events').select('*').eq('kind', 'news').gte('published_at', newsSince).order('published_at', { ascending: false }).limit(60),
    db.from('ec_products').select('key,official_name,official_url,image_url,channels'),
    db.from('ec_coupons').select('*').eq('active', true).or(`end_date.gte.${since},end_date.is.null`),
  ]);
  return (
    <Dashboard
      listings={(listings || []) as Listing[]}
      snaps={(snaps || []) as Snap[]}
      events={[...(banks || []).map((b: any) => ({ ...b, image_url: b.image_url || b.archived_image_url })), ...upcomingNews(cleanNews((news || []) as PlatformEvent[]), todayTaipei())] as PlatformEvent[]}
      officials={(officials || []) as OfficialProduct[]}
      today={todayTaipei()}
      userProducts={userProducts}
      hidden={Array.from(hidden)}
      coupons={(coupons || []) as any}
    />
  );
}

// 購物節新聞：活動日期已經過的不顯示；有日期且還沒到的排前面並標示活動日
function upcomingNews(items: PlatformEvent[], today: string) {
  const withDate = items.map((n) => ({ ...n, event_on: eventStatus(n.title || '', n.published_at || today, today) }))
    .filter((n) => !n.event_on.past)
    // 沒寫活動日期的一般優惠新聞只留最近 10 天
    .filter((n) => n.event_on.on || (n.published_at || '') >= new Date(Date.now() - 10 * 86400_000).toISOString())
    .map((n) => ({ ...n, event_on: n.event_on.on }));
  return withDate.sort((a, b) => (a.event_on && b.event_on ? a.event_on.localeCompare(b.event_on) : a.event_on ? -1 : b.event_on ? 1 : (b.published_at || '').localeCompare(a.published_at || '')));
}
