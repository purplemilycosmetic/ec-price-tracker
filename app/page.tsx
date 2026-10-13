import { adminDb, todayTaipei } from '@/lib/db';
import Dashboard, { type Listing, type Snap } from './Dashboard';

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
  const since = new Date(Date.now() + 8 * 3600_000 - 45 * 86400_000).toISOString().slice(0, 10);
  const [{ data: listings }, { data: snaps }] = await Promise.all([
    db.from('ec_listings').select('id,brand,line,spec,platform,url,title').eq('active', true),
    db.from('ec_price_snapshots')
      .select('listing_id,captured_on,status,list_price,sale_price,final_price,promos,in_stock,error')
      .gte('captured_on', since).order('captured_on'),
  ]);
  return <Dashboard listings={(listings || []) as Listing[]} snaps={(snaps || []) as Snap[]} today={todayTaipei()} />;
}
