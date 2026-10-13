import { adminDb, todayTaipei } from '@/lib/db';
import { cleanNews } from '@/lib/news';
import Dashboard, { type Listing, type Snap, type PlatformEvent } from './Dashboard';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function Page() {
  const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'ADMIN_KEY', 'CRON_SECRET'].filter((k) => !process.env[k]);
  if (missing.length)
    return (
      <div className="wrap">
        <h1>保養品比價雷達</h1>
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
  const [{ data: listings }, { data: snaps }, { data: banks }, { data: news }] = await Promise.all([
    db.from('ec_listings').select('id,brand,line,spec,platform,url,title,image_url').eq('active', true),
    db.from('ec_price_snapshots')
      .select('listing_id,captured_on,status,list_price,sale_price,final_price,promos,in_stock,error')
      .gte('captured_on', since).order('captured_on').limit(20000),
    db.from('ec_platform_events').select('*').eq('kind', 'bank').gte('last_seen', recent),
    db.from('ec_platform_events').select('*').eq('kind', 'news').gte('published_at', newsSince).order('published_at', { ascending: false }).limit(60),
  ]);
  return (
    <Dashboard
      listings={(listings || []) as Listing[]}
      snaps={(snaps || []) as Snap[]}
      events={[...(banks || []), ...cleanNews((news || []) as PlatformEvent[])] as PlatformEvent[]}
      today={todayTaipei()}
    />
  );
}
