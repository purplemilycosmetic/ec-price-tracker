// 九項分數雷達圖（實線＝品牌分數，虛線＝建議水準 60 分）
export default function Radar({ dims }: { dims: { name: string; score: number }[] }) {
  const W = 520, H = 440, cx = W / 2, cy = H / 2 + 6, R = 150, n = dims.length;
  const pt = (i: number, v: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [cx + Math.cos(a) * R * (v / 100), cy + Math.sin(a) * R * (v / 100)];
  };
  const poly = (vals: number[]) => vals.map((v, i) => pt(i, v).join(',')).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="radar" role="img" aria-label={`九項分數：${dims.map((d) => `${d.name} ${d.score}`).join('、')}`}>
      {[20, 40, 60, 80, 100].map((r) => <polygon key={r} points={poly(dims.map(() => r))} className="radar-grid" />)}
      {dims.map((_, i) => { const [x, y] = pt(i, 100); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} className="radar-grid" />; })}
      {[20, 40, 60, 80, 100].map((r) => <text key={r} x={cx + 3} y={cy - (R * r) / 100 + 3} className="radar-tick">{r}</text>)}
      <polygon points={poly(dims.map(() => 60))} className="radar-ref" />
      <polygon points={poly(dims.map((d) => Math.max(d.score, 2)))} className="radar-area" />
      {dims.map((d, i) => { const [x, y] = pt(i, Math.max(d.score, 2)); return <circle key={i} cx={x} cy={y} r={4} className="radar-dot" />; })}
      {dims.map((d, i) => {
        const [x, y] = pt(i, 122);
        return <text key={d.name} x={x} y={y + 4} textAnchor={Math.abs(x - cx) < 10 ? 'middle' : x > cx ? 'start' : 'end'} className="radar-label">{d.name}</text>;
      })}
    </svg>
  );
}
