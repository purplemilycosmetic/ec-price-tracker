'use client';
import { useRef, useState } from 'react';

export type Series = { key: string; name: string; pts: (number | null)[] };
const fmt = (n: number) => `$${n.toLocaleString()}`;

// 每日最低價趨勢：一條線一個平台，滑過顯示當天各平台價格
export default function TrendChart({ days, series }: { days: string[]; series: Series[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const live = series.filter((s) => s.pts.some((v) => v != null));
  const all = live.flatMap((s) => s.pts).filter((v): v is number => v != null);
  if (!all.length) return <div className="muted chart-empty">這個規格還沒有價格資料</div>;

  const W = 720, H = 260, L = 56, R = 72, T = 16, B = 32;
  let lo = Math.min(...all), hi = Math.max(...all);
  const pad = Math.max(20, (hi - lo) * 0.15);
  lo = Math.max(0, Math.floor((lo - pad) / 50) * 50); hi = Math.ceil((hi + pad) / 50) * 50;
  const n = days.length;
  const x = (i: number) => (n <= 1 ? L + (W - L - R) / 2 : L + (i * (W - L - R)) / (n - 1));
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo || 1)) * (H - T - B);
  const ticks = [0, 1, 2, 3, 4].map((k) => lo + ((hi - lo) * k) / 4);
  const xEvery = Math.max(1, Math.ceil(n / 6));

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const box = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    let best = 0;
    for (let i = 1; i < n; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    setHover(best);
  }

  // 線尾直接標示平台名稱（避免標籤重疊，依 y 位置錯開）
  const ends = live
    .map((s) => { let i = s.pts.length - 1; while (i >= 0 && s.pts[i] == null) i--; return { s, i, y: i >= 0 ? y(s.pts[i]!) : 0 }; })
    .filter((e) => e.i >= 0).sort((a, b) => a.y - b.y);
  for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 14) ends[k].y = ends[k - 1].y + 14;

  return (
    <div className="chart-wrap">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="各平台每日最低價趨勢"
        onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {ticks.map((t, k) => (
          <g key={k}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="grid" />
            <text x={L - 8} y={y(t) + 4} textAnchor="end" className="tick">{fmt(Math.round(t))}</text>
          </g>
        ))}
        {days.map((d, i) => (i % xEvery === 0 || i === n - 1) && (
          <text key={d} x={x(i)} y={H - 10} textAnchor="middle" className="tick">{d.slice(5).replace('-', '/')}</text>
        ))}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} className="crosshair" />}
        {live.map((s) => {
          let d = '';
          s.pts.forEach((v, i) => { if (v != null) d += `${d && s.pts[i - 1] != null ? 'L' : 'M'}${x(i)},${y(v)}`; });
          return (
            <g key={s.key}>
              <path d={d} fill="none" stroke={`var(--${s.key})`} strokeWidth={2} strokeLinejoin="round" />
              {s.pts.map((v, i) => v != null && (
                <circle key={i} cx={x(i)} cy={y(v)} r={hover === i ? 5 : 4} fill={`var(--${s.key})`} stroke="var(--card)" strokeWidth={2} />
              ))}
            </g>
          );
        })}
        {ends.map(({ s, y: ly }) => (
          <text key={s.key} x={W - R + 8} y={ly + 4} className="endlabel">{s.name}</text>
        ))}
      </svg>
      {hover != null && (
        <div className="tooltip" style={{ left: `${(x(hover) / W) * 100}%` }}>
          <b>{days[hover]}</b>
          {live.map((s) => (
            <div key={s.key}><span className="dot" style={{ background: `var(--${s.key})` }} />{s.name}
              <span className="tv">{s.pts[hover] != null ? fmt(s.pts[hover]!) : '—'}</span></div>
          ))}
        </div>
      )}
      <div className="legend">
        {series.map((s) => (
          <span key={s.key} className={s.pts.some((v) => v != null) ? '' : 'off'}>
            <span className="dot" style={{ background: `var(--${s.key})` }} />{s.name}
          </span>
        ))}
      </div>
      {n <= 1 && <div className="muted" style={{ marginTop: 4 }}>目前只有 1 天資料，之後每天 09:00 會多一個點，連成趨勢線。</div>}
      <details className="tableview">
        <summary>以表格檢視</summary>
        <table>
          <thead><tr><th>日期</th>{series.map((s) => <th key={s.key}>{s.name}</th>)}</tr></thead>
          <tbody>
            {days.map((d, i) => (
              <tr key={d}><td>{d}</td>{series.map((s) => <td key={s.key}>{s.pts[i] != null ? fmt(s.pts[i]!) : '—'}</td>)}</tr>
            )).reverse()}
          </tbody>
        </table>
      </details>
    </div>
  );
}
