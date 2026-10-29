import { adminDb } from '@/lib/db';
import AuditForm from './AuditForm';

export const dynamic = 'force-dynamic';

export default async function Audits() {
  const { data } = await adminDb().from('ec_brand_audits').select('id,brand,url,category,status,score,grade,created_at').order('created_at', { ascending: false }).limit(60);
  const rows = data || [];
  const tw = (s: string) => new Date(new Date(s).getTime() + 8 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
  return (
    <main className="page">
      <section className="search-head">
        <h1 className="display">品牌健檢</h1>
        <p className="lede">檢查品牌在 AI 搜尋時代被看見、被理解、被推薦的程度：官網結構、AI 可讀性、搜尋結果、第三方媒體、社群口碑、影音與 AI 推薦潛力，最後產生問題點與 90 天建議。每次健檢約 1 分鐘，結果會保留，方便比較前後變化。</p>
      </section>
      <section className="block"><div className="block-head"><h2>新增健檢</h2></div><AuditForm /></section>
      <section className="block">
        <div className="block-head"><h2>健檢紀錄</h2></div>
        {rows.length ? (
          <div className="table-wrap"><table className="grid-table hist-table">
            <thead><tr><th scope="col">品牌</th><th scope="col">品類</th><th scope="col">分數</th><th scope="col">時間</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id} className="row-static">
                <th scope="row"><a href={`/audit/${r.id}`}>{r.brand}</a><span className="hist-sub">{r.url.replace(/^https?:\/\//, '')}</span></th>
                <td data-label="品類">{r.category || '—'}</td>
                <td data-label="分數" className="num">{r.status === 'done' ? `${r.score}（${r.grade} 級）` : '進行中'}</td>
                <td data-label="時間" className="num">{tw(r.created_at)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <p className="none">還沒有健檢紀錄。</p>}
      </section>
    </main>
  );
}
