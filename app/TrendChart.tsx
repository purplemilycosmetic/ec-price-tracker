'use client';
import { useEffect, useRef, useState } from 'react';

export type Series = { key: string; name: string; pts: (number | null)[]; color?: string };
const col = (s: Series) => s.color ?? `var(--${s.key})`;
const fmt = (n: number) => `$${n.toLocaleString()}`;

// 每日最低價趨勢：一條線一個平台，滑過顯示當天各平台價格
export default function TrendChart({ days, series, endLabels = true }: { days: string[]; series: Series[]; endLabels?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  // 依容器實際寬度繪圖，手機上文字不會被縮小
  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);
  const live = series.filter((s) => s.pts.some((v) => v != null));
  const all = live.flatMap((s) => s.pts).filter((v): v is number => v != null);
  if (!all.length) return <div className="muted chart-empty">這個規格還沒有價格資料</div>;

  const W = Math.max(300, width), H = W < 500 ? 220 : 260, L = 52, R = !endLabels ? 16 : W < 500 ? 66 : 76, T = 16, B = 32;
  // 整齊的刻度：間距取 1/2/5 × 10^n
  const rawLo = Math.min(...all), rawHi = Math.max(...all);
  const span = Math.max(rawHi - rawLo, rawHi * 0.2, 20);
  const mag = Math.pow(10, Math.floor(Math.log10(span / 4)));
  const step = [1, 2, 5, 10].map((k) => k * mag).find((v) => span / v <= 5)!;
  const lo = Math.max(0, Math.floor((rawLo - span * 0.1) / step) * step);
  const hi = Math.ceil((rawHi + span * 0.1) / step) * step;
  const n = days.length;
  const x = (i: number) => (n <= 1 ? L + (W - L - R) / 2 : L + (i * (W - L - R)) / (n - 1));
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo || 1)) * (H - T - B);
  const ticks: number[] = [];
  for (let t = lo; t <= hi + 1e-9; t += step) ticks.push(t);
  const xEvery = Math.max(1, Math.ceil(n / (W < 500 ? 4 : 7)));

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
    <div className="chart-wrap" ref={wrap}>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="chart" role="img" aria-label="各平台每日最低價趨勢"
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
              <path d={d} fill="none" stroke={col(s)} strokeWidth={2} strokeLinejoin="round" />
              {s.pts.map((v, i) => v != null && (
                <circle key={i} cx={x(i)} cy={y(v)} r={hover === i ? 5 : 4} fill={col(s)} stroke="var(--surface)" strokeWidth={2} />
              ))}
            </g>
          );
        })}
        {endLabels && ends.map(({ s, y: ly }) => (
          <text key={s.key} x={W - R + 8} y={ly + 4} className="endlabel">{s.name}</text>
        ))}
      </svg>
      {hover != null && (
        <div className="tooltip" style={{ left: `${(x(hover) / W) * 100}%` }}>
          <b>{days[hover]}</b>
          {live.map((s) => (
            <div key={s.key}><span className="dot" style={{ background: col(s) }} />{s.name}
              <span className="tv">{s.pts[hover] != null ? fmt(s.pts[hover]!) : '—'}</span></div>
          ))}
        </div>
      )}
      <div className="legend">
        {series.map((s) => (
          <span key={s.key} className={s.pts.some((v) => v != null) ? '' : 'off'}>
            <span className="dot" style={{ background: col(s) }} />{s.name}
          </span>
        ))}
      </div>
      {n <= 1 && <div className="muted" style={{ marginTop: 4 }}>目前只有 1 天的資料。每天 09:00 會多一個點，累積幾天後就能看出漲跌。</div>}
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
