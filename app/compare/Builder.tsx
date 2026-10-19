'use client';
import { useState } from 'react';
import { encode, CMP_PLATFORMS, CMP_COLORS, type Line } from '@/lib/compareShared';

// 比較條件：每一列是一條線（產品 × 規格 × 平台 × 平均或最低 × 是否換算每入）
export default function Builder({ products, specs, initial, from, to, today }: {
  products: { key: string; name: string }[]; specs: Record<string, string[]>; initial: Line[]; from: string; to: string; today: string;
}) {
  const blank = (): Line => ({ product: products[0]?.key ?? '', spec: '', platform: 'all', stat: 'avg', unit: false, coupon: false });
  const [rows, setRows] = useState<Line[]>(initial.length ? initial : [blank(), { ...blank(), product: products[1]?.key ?? products[0]?.key ?? '' }]);
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);
  const set = (i: number, patch: Partial<Line>) => setRows((r) => r.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const go = (range?: [string, string]) => {
    const q = new URLSearchParams();
    q.set('s', rows.filter((r) => r.product).map(encode).join('!'));
    q.set('from', range?.[0] ?? f); q.set('to', range?.[1] ?? t);
    window.location.href = '/compare?' + q.toString();
  };
  const back = (n: number) => { const d = new Date(today + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };

  return (
    <section className="block cmp-builder">
      {rows.map((r, i) => (
        <div key={i} className="cmp-row">
          <span className="cmp-dot" style={{ background: CMP_COLORS[i] }} aria-hidden />
          <select value={r.product} onChange={(e) => set(i, { product: e.target.value, spec: '' })} aria-label="產品">
            {products.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
          </select>
          <select value={r.spec} onChange={(e) => set(i, { spec: e.target.value })} aria-label="規格">
            <option value="">全部規格</option>
            {(specs[r.product] || []).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={r.platform} onChange={(e) => set(i, { platform: e.target.value })} aria-label="平台">
            {CMP_PLATFORMS.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
          </select>
          <select value={r.stat} onChange={(e) => set(i, { stat: e.target.value as Line['stat'] })} aria-label="計算方式">
            <option value="avg">平均價</option><option value="min">最低價</option>
          </select>
          <label className="cmp-unit"><input type="checkbox" checked={r.unit} onChange={(e) => set(i, { unit: e.target.checked })} />換算每入</label>
          <label className="cmp-unit"><input type="checkbox" checked={r.coupon} onChange={(e) => set(i, { coupon: e.target.checked })} />帶入券後價</label>
          {rows.length > 1 && <button className="btn-quiet" onClick={() => setRows(rows.filter((_, k) => k !== i))} aria-label="刪除這條線">刪除</button>}
        </div>
      ))}
      <div className="cmp-actions">
        {rows.length < 6 && <button className="btn-add" onClick={() => setRows([...rows, blank()])}>＋ 新增一條線</button>}
        <label>開始<input type="date" value={f} max={today} onChange={(e) => setF(e.target.value)} /></label>
        <label>結束<input type="date" value={t} max={today} onChange={(e) => setT(e.target.value)} /></label>
        <button className="primary" onClick={() => go()}>比較</button>
      </div>
      <div className="seg presets" role="group" aria-label="快速選擇期間">
        {[['近 7 天', 6], ['近 30 天', 29], ['近 90 天', 89], ['近一年', 364]].map(([lb, n]) => (
          <button key={lb as string} onClick={() => go([back(n as number), today])}>{lb}</button>
        ))}
      </div>
    </section>
  );
}
