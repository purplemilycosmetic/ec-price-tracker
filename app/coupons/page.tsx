import { adminDb, todayTaipei } from '@/lib/db';
import { PRODUCTS, productLabel } from '@/lib/classify';
import { loadUserProducts, loadHidden } from '@/lib/custom';
import { activeOn, describe, type Coupon } from '@/lib/couponCalc';
import CouponForm, { DeleteCoupon } from './CouponForm';

export const dynamic = 'force-dynamic';

const PLATFORMS = [{ key: 'momo', name: 'momo' }, { key: 'shopee', name: '蝦皮' }, { key: 'coupang', name: '酷澎' }];
const SRC: Record<string, string> = { 'momo-official': 'momo 官方折價券頁', callingtaiwan: '省錢網站整理', ptt: 'PTT 省錢板', manual: '手動輸入' };

export default async function Coupons() {
  const today = todayTaipei();
  const [{ data }, users, hidden, { data: runs }] = await Promise.all([
    adminDb().from('ec_coupons').select('*').eq('active', true).or(`end_date.gte.${today},end_date.is.null`).order('platform'),
    loadUserProducts(), loadHidden(),
    adminDb().from('ec_debug').select('created_at').eq('url', 'coupon-run').order('id', { ascending: false }).limit(1),
  ]);
  const coupons = ((data || []) as Coupon[]).filter((c) => activeOn(c, today) || (c.start_date && c.start_date > today));
  const products = [
    ...PRODUCTS.filter((p) => !hidden.has(p.key)).map((p) => ({ key: p.key, name: productLabel(p) })),
    ...users.map((u) => ({ key: u.key, name: u.name })),
  ];
  const nameOf = (k: string | null) => products.find((p) => p.key === k)?.name ?? k;
  const group = (c: Coupon) => (c.kind === 'bank' ? '指定銀行卡' : c.new_user ? '新客限定' : c.vip ? 'VIP／會員限定' : c.kind === 'shop' ? '賣場券' : ['category', 'designated'].includes(c.scope) ? '其他分類／指定商品（不自動套用）' : '可自動套用');
  const ORDER = ['可自動套用', '賣場券', 'VIP／會員限定', '新客限定', '指定銀行卡', '其他分類／指定商品（不自動套用）'];

  return (
    <main className="page">
      <section className="search-head">
        <h1 className="display">優惠券</h1>
        <p className="lede">
          每小時自動從 momo 官方折價券頁、省錢網站與 PTT 省錢板收集 momo、蝦皮、酷澎的券。「可自動套用」的券會帶入各頁面的券後價；
          賣場券和你帳號專屬的券請在下方手動新增。{runs?.[0] && <>最近更新：{new Date(new Date(runs[0].created_at).getTime() + 8 * 3600e3).toISOString().slice(5, 16).replace('T', ' ')}</>}
        </p>
      </section>

      <section className="block">
        <div className="block-head"><h2>手動新增券</h2><p>例如商品頁「價格優惠試算」裡的賣場優惠券、你帳號領到的蝦皮券。</p></div>
        <CouponForm products={products} today={today} />
      </section>

      <div className="platforms">
        {PLATFORMS.map((p) => {
          const list = coupons.filter((c) => c.platform === p.key);
          return (
            <article key={p.key} className="plat-card">
              <h3><span className="swatch" style={{ background: `var(--${p.key})` }} />{p.name}<span className="count">{list.length} 張</span></h3>
              {ORDER.map((g) => {
                const items = list.filter((c) => group(c) === g).sort((a, b) => a.min_spend - b.min_spend);
                if (!items.length) return null;
                return (
                  <div key={g} className="plat-sec">
                    <h4>{g}</h4>
                    <ul className="log">{items.map((c) => (
                      <li key={c.id}>
                        <span className="promo-text">{c.bank ? `${c.bank} ` : ''}{c.title}</span>
                        <span className="hist-sub">{describe(c)}{c.product_key ? `｜限 ${nameOf(c.product_key)}` : ''}{c.start_date && c.start_date > today ? `｜${c.start_date.slice(5).replace('-', '/')} 起` : ''}</span>
                        <span className="hist-sub">來源：{c.url ? <a href={c.url} target="_blank" rel="noreferrer">{SRC[c.source] ?? c.source}</a> : SRC[c.source] ?? c.source}{c.note ? `｜${c.note}` : ''}
                          {c.source === 'manual' && <DeleteCoupon id={c.id} />}</span>
                      </li>
                    ))}</ul>
                  </div>
                );
              })}
              {!list.length && <p className="none">目前沒有收集到券</p>}
            </article>
          );
        })}
      </div>
      <p className="foot">券後價只用「可自動套用」與手動新增的券計算：單件結帳時，挑一張最划算的賣場券加一張最划算的平台券。限量券可能已被搶完；新客、VIP、指定銀行卡的券只列出不計算。實際金額以結帳頁為準。</p>
    </main>
  );
}
