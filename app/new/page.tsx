import { searchBiggo } from '@/lib/biggo';
import { searchMomo } from '@/lib/momoSearch';
import { classify, normalize } from '@/lib/classify';
import NewForm, { type Hit } from './NewForm';
import Restore from './Restore';
import { PRODUCTS, CUSTOM, productLabel } from '@/lib/classify';
import { loadUserProducts, loadHidden } from '@/lib/custom';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export default async function NewProduct({ searchParams }: { searchParams: { name?: string; q?: string } }) {
  const name = (searchParams.name || '').trim().slice(0, 40);
  const q = (searchParams.q || name).trim().slice(0, 60);
  const [hidden, users] = await Promise.all([loadHidden(), loadUserProducts(true)]);
  const stopped = [
    ...PRODUCTS.filter((p) => hidden.has(p.key)).map((p) => ({ key: p.key, name: productLabel(p) })),
    ...users.filter((u) => !u.active).map((u) => ({ key: u.key, name: u.name })),
    ...(hidden.has(CUSTOM) ? [{ key: CUSTOM, name: '自訂追蹤' }] : []),
  ];
  let hits: Hit[] = [];
  const failed: string[] = [];
  if (q) {
    const [m, b] = await Promise.all([
      searchMomo(q).catch(() => ({ status: 0, items: [] as any[] })),
      searchBiggo(q, true).catch(() => ({ status: 0, items: [] as any[] }))
        .then((r) => r.status === 200 ? r : new Promise((ok) => setTimeout(ok, 1500)).then(() => searchBiggo(q, true)).catch(() => ({ status: 0, items: [] as any[] }))),
    ]);
    if (m.status !== 200) failed.push('momo');
    if (b.status !== 200) failed.push('蝦皮商城、酷澎');
    // 標題包含名稱每個字詞的商品預先勾選
    const tokens = normalize(name).toLowerCase().split(/\s+/).filter(Boolean);
    const match = (t: string) => tokens.length > 0 && tokens.every((k) => normalize(t).toLowerCase().includes(k));
    hits = [
      ...m.items.map((i: any) => ({ platform: 'momo', title: i.title, url: i.url, price: i.price, image: i.image ?? null })),
      ...b.items.filter((i: any) => i.platform === 'shopee' || i.platform === 'coupang')
        .map((i: any) => ({ platform: i.platform, title: i.title, url: i.url, price: i.price, image: i.image ?? null })),
    ].map((h) => ({ ...h, spec: classify(h.title).spec, match: match(h.title) }));
  }
  return (
    <main className="page">
      <section className="search-head">
        <h1 className="display">新增追蹤產品</h1>
        <p className="lede">替你想追蹤的產品建立一個分頁，同時挑選 momo、蝦皮商城、酷澎上的商品頁，之後每天一起更新價格與活動。</p>
      </section>
      <form className="hist-form" action="/new">
        <label>產品名稱<input name="name" defaultValue={name} placeholder="例如：理膚寶水 B5 修復霜 40ml" required /></label>
        <label>搜尋關鍵字（選填）<input name="q" defaultValue={searchParams.q || ''} placeholder="留空＝用產品名稱搜尋" /></label>
        <button className="primary" type="submit">搜尋各平台</button>
      </form>
      {failed.length > 0 && <p className="warn">{failed.join('、')} 這次沒有回應，結果可能不完整，稍後再搜一次。</p>}
      {name && <NewForm name={name} query={q} hits={hits} />}
      {!name && <Restore items={stopped} />}
    </main>
  );
}
