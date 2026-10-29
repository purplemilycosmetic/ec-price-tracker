'use client';
import { useEffect, useState } from 'react';

const STAGES = [
  { key: 'site', name: '官網結構與 AI 可讀性' }, { key: 'speed', name: '手機版網速（Google PageSpeed）' },
  { key: 'search', name: '搜尋結果與選購推薦情境' }, { key: 'sources', name: '閱讀排名前面的推薦文章' }, { key: 'social', name: '社群口碑與影音' }, { key: 'ai', name: 'AI 推薦測試（Gemini）' },
];

// 依序（部分同時）執行健檢各階段，完成後重新整理頁面顯示報告
export default function Runner({ id, done }: { id: number; done: string[] }) {
  const [state, setState] = useState<Record<string, 'wait' | 'run' | 'ok' | 'err'>>(Object.fromEntries(STAGES.map((s) => [s.key, done.includes(s.key) ? 'ok' : 'wait'])));
  const [msg, setMsg] = useState('');
  const [sec, setSec] = useState(0);
  useEffect(() => {
    let key = ''; try { key = localStorage.getItem('ec-admin-key') || ''; } catch {}
    if (!key) key = window.prompt('輸入管理密碼以執行健檢') || '';
    if (!key) { setMsg('需要管理密碼才能執行'); return; }
    const t0 = Date.now();
    const tick = setInterval(() => setSec(Math.round((Date.now() - t0) / 1000)), 1000);
    const run = async (stage: string): Promise<number> => {
      setState((s) => ({ ...s, [stage]: 'run' }));
      const r = await fetch('/api/audit/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, id, stage }), signal: AbortSignal.timeout(75000) }).catch(() => null);
      const j = r?.ok ? await r.json().catch(() => ({})) : {};
      setState((s) => ({ ...s, [stage]: r?.ok ? 'ok' : 'err' }));
      return r?.ok ? (j.missing ?? 0) : -1;
    };
    // 失敗或有缺漏時，隔幾秒補查一次（只補沒查到的部分）
    const runRetry = async (stage: string) => {
      const m = await run(stage);
      if (m !== 0) { setMsg('搜尋服務忙碌，稍等後補查…'); await new Promise((ok) => setTimeout(ok, 8000)); await run(stage); setMsg(''); }
    };
    (async () => {
      const todo = STAGES.filter((s) => !done.includes(s.key)).map((s) => s.key);
      // 搜尋、社群、推薦文章都靠同一個免費搜尋服務，同時送會被限流，所以依序執行；其他項目同時進行
      await Promise.all([
        ...todo.filter((k) => !['search', 'social', 'sources'].includes(k)).map(run),
        (async () => {
          if (todo.includes('search')) await runRetry('search');
          if (todo.includes('social')) await runRetry('social');
          if (todo.includes('sources')) await run('sources');
        })(),
      ]);
      setMsg('彙整評分中…');
      await run('score');
      clearInterval(tick);
      window.location.href = `/audit/${id}`;
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const icon = { wait: '○', run: '◐', ok: '●', err: '×' };
  return (
    <section className="block">
      <div className="block-head"><h2>健檢進行中</h2><p>約 1～2 分鐘，請不要關閉這個頁面。已經過 {sec} 秒。</p></div>
      <ul className="audit-steps">{STAGES.map((s) => <li key={s.key} className={`st-${state[s.key]}`}><span>{icon[state[s.key]]}</span>{s.name}{state[s.key] === 'err' && '（這項失敗，報告會標示資料不足）'}</li>)}</ul>
      {msg && <p className="form-msg">{msg}</p>}
    </section>
  );
}
