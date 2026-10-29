import { notFound } from 'next/navigation';
import { adminDb } from '@/lib/db';
import { KIND_NAME } from '@/lib/audit/common';
import type { Scored } from '@/lib/audit/score';
import type { SiteResult } from '@/lib/audit/site';
import type { SpeedResult } from '@/lib/audit/speed';
import type { SearchResult } from '@/lib/audit/search';
import type { SocialResult } from '@/lib/audit/social';
import type { AiResult } from '@/lib/audit/ai';
import type { SourcesResult } from '@/lib/audit/sources';
import Runner from './Runner';
import Radar from './Radar';
import AuditForm from '../AuditForm';

export const dynamic = 'force-dynamic';

const level = (n: number) => (n >= 70 ? ['良好', 'lv-good'] : n >= 40 ? ['普通', 'lv-mid'] : n >= 15 ? ['偏低', 'lv-low'] : ['極低', 'lv-bad']);

export default async function Report({ params, searchParams }: { params: { id: string }; searchParams: { retry?: string } }) {
  const { data: a } = await adminDb().from('ec_brand_audits').select('*').eq('id', +params.id).single();
  if (!a) notFound();
  const r = a.result || {};
  const site = r.site as SiteResult | undefined, speed = r.speed as SpeedResult | undefined, search = r.search as SearchResult | undefined;
  const social = r.social as SocialResult | undefined, ai = r.ai as AiResult | undefined, s = r.scored as Scored | undefined;
  const sources = r.sources as SourcesResult | undefined;
  const { data: prev } = await adminDb().from('ec_brand_audits').select('id,score,created_at').eq('url', a.url).eq('status', 'done').lt('created_at', a.created_at).order('created_at', { ascending: false }).limit(1);
  const day = new Date(new Date(a.created_at).getTime() + 8 * 3600e3).toISOString().slice(0, 10);

  // 這次沒查到的平台／關鍵字（搜尋服務限流）
  const missSocial = (social?.sites ?? []).filter((x) => x.status !== 200).map((x) => x.name);
  const missSearch = (search?.queries ?? []).filter((x) => x.status !== 200).map((x) => `「${x.q}」`);
  const retry = !!searchParams.retry && (missSocial.length > 0 || missSearch.length > 0);
  if (a.status !== 'done' || !s || retry) {
    const redo = retry ? [...(missSocial.length ? ['social'] : []), ...(missSearch.length ? ['search', 'sources'] : [])] : [];
    return (
      <main className="page">
        <section className="search-head"><h1 className="display">{a.brand}｜品牌健檢</h1><p className="lede">{a.url}</p></section>
        <Runner id={a.id} done={['site', 'speed', 'search', 'sources', 'social', 'ai'].filter((k) => k in r && !redo.includes(k))} />
      </main>
    );
  }
  const [lvTxt, lvCls] = level(s.score);
  const nav = [['quick', '快速結論'], ['score', '總評分'], ['ai', 'AI 能見度'], ['site', '官網結構'], ['serp', '搜尋結果'], ['comp', '競品'], ['social', '社群影音'], ['issues', '問題點'], ['plan', '90 天建議'], ['kw', '關鍵字'], ['final', '最終結論']];
  const rec = search?.queries.filter((q) => q.type === 'recommend') ?? [];

  return (
    <main className="page audit">
      <section className="audit-hero">
        <div className="audit-eyebrow">AI SEO / AEO HEALTH AUDIT · {day}</div>
        <h1 className="display">{a.brand}</h1>
        <p className="audit-sub">AI 推薦力健檢報告</p>
        <p className="hist-sub">官網：<a href={a.url} target="_blank" rel="noreferrer">{a.url.replace(/^https?:\/\//, '')}</a>{a.category && <>　主要品類：{a.category}</>}　資料來源：官網實測、Google PageSpeed、DuckDuckGo 搜尋、{ai?.enabled ? `Gemini（${ai.model}）` : 'AI 測試未啟用'}</p>
        <div className="audit-score">
          <div><span className="big num">{s.score}</span><span className="of">/ 100</span></div>
          <div><span className={`grade ${lvCls}`}>{s.grade} 級</span><p>{s.gradeLabel}</p>{prev?.[0] && <p className="hist-sub">上次 {prev[0].score} 分（<a href={`/audit/${prev[0].id}`}>查看</a>），{s.score - prev[0].score >= 0 ? `進步 ${s.score - prev[0].score}` : `下降 ${prev[0].score - s.score}`} 分</p>}</div>
        </div>
        {(missSocial.length > 0 || missSearch.length > 0) && (
          <p className="warn">這次有部分資料沒查到（免費搜尋服務暫時限流）：{[...missSearch, ...missSocial].join('、')}。這些項目不計入分數。<a href={`/audit/${a.id}?retry=1`}>補查缺漏</a></p>
        )}
        <nav className="seg audit-nav">{nav.map(([k, t], i) => <a key={k} href={`#${k}`}>{String(i + 1).padStart(2, '0')} {t}</a>)}</nav>
      </section>

      <section className="block" id="quick">
        <div className="block-head"><h2>快速結論</h2></div>
        <p className="audit-quote">{s.quick}</p>
        <div className="audit-cards">
          <div><h4>AI 推薦測試</h4><b>{ai?.enabled ? `${ai.answers.filter((x) => x.type === 'recommend' && x.mentioned).length} / ${ai.answers.filter((x) => x.type === 'recommend').length} 題提到品牌` : `${rec.filter((q) => q.hits.some((h) => h.brand)).length} / ${rec.length} 個推薦搜尋有出現`}</b></div>
          <div><h4>品牌搜尋</h4><b>{(() => { const bq = search?.queries.find((q) => q.type === 'brand'); const i = bq ? bq.hits.findIndex((h) => h.kind === 'official') + 1 : 0; return i ? `官網排第 ${i}` : '官網未進前 10'; })()}</b></div>
          <div><h4>網站速度</h4><b>{speed?.ok ? `手機 ${speed.performance} / 100` : (speed as any)?.fallback ? `首頁回應 ${((speed as any).fallback.ms / 1000).toFixed(1)} 秒` : '未測得'}</b>{!speed?.ok && (speed as any)?.fallback && <p className="hist-sub">{(speed as any).error}，改用簡易量測；HTML {(speed as any).fallback.kb} KB、{(speed as any).fallback.scripts} 個程式檔</p>}</div>
        </div>
      </section>

      <section className="block" id="score">
        <div className="block-head"><h2>總評分</h2><p>九個面向各自 0–100 分，綜合分數依重要性加權（AI 推薦潛力權重最高）。標「推估」的項目是間接判斷。</p></div>
        <div className="audit-split">
          <Radar dims={s.dims.map((d) => ({ name: d.name, score: d.score }))} />
          <div className="table-wrap"><table className="grid-table hist-table">
            <thead><tr><th scope="col">項目</th><th scope="col">分數</th><th scope="col">評語</th></tr></thead>
            <tbody>{s.dims.map((d) => { const [t, c] = level(d.score); return (
              <tr key={d.key} className="row-static"><th scope="row">{d.name}</th><td className="num" data-label="分數">{d.score}<span className={`lv ${c}`}>{t}</span></td><td data-label="評語">{d.note}</td></tr>
            ); })}</tbody>
          </table></div>
        </div>
      </section>

      <section className="block" id="ai">
        <div className="block-head"><h2>AI 能見度</h2><p>AI 工具是否容易理解並推薦這個品牌。</p></div>
        {ai?.enabled ? (
          <div className="audit-ai">{ai.answers.map((x, i) => (
            <details key={i} className={x.mentioned ? 'hit' : 'miss'}>
              <summary><span className={`lv ${x.ok ? (x.mentioned ? 'lv-good' : 'lv-bad') : 'lv-mid'}`}>{x.ok ? (x.mentioned ? '有提到' : '沒提到') : '失敗'}</span>{x.q}{x.others.length > 0 && <span className="hist-sub">　同時提到：{x.others.slice(0, 6).join('、')}</span>}</summary>
              <div className="ai-answer">{x.ok ? x.text : `錯誤：${(x as any).error}`}{x.sources?.length ? <p className="hist-sub">參考來源：{x.sources.slice(0, 6).join('、')}</p> : null}</div>
            </details>
          ))}</div>
        ) : (
          <>
            <p className="form-msg">尚未設定 Gemini 金鑰，這一節改用搜尋結果推估：AI 回答推薦問題時大多參考搜尋結果裡的文章，品牌沒出現在這些結果中，通常也不會被 AI 推薦。設定方式見頁尾。</p>
            <div className="table-wrap"><table className="grid-table hist-table">
              <thead><tr><th scope="col">推薦問題</th><th scope="col">狀態</th><th scope="col">說明</th></tr></thead>
              <tbody>{rec.map((q) => { const i = q.hits.findIndex((h) => h.brand); return (
                <tr key={q.q} className="row-static"><th scope="row">{q.q}</th><td data-label="狀態"><span className={`lv ${i >= 0 && i < 3 ? 'lv-good' : i >= 0 ? 'lv-mid' : 'lv-bad'}`}>{i >= 0 ? `第 ${i + 1} 筆` : '未出現'}</span></td>
                  <td data-label="說明">{q.status !== 200 ? '搜尋失敗' : i >= 0 ? q.hits[i].title : `前 ${q.hits.length} 筆：${q.hits.slice(0, 3).map((h) => h.host).join('、')}…`}</td></tr>
              ); })}</tbody>
            </table></div>
            {!rec.length && <p className="none">未填主要品類，沒有測試推薦情境。</p>}
          </>
        )}
        {sources?.articles.length ? (
          <>
            <h3 className="sub-h">AI 常引用的推薦文章（排名前面的「{a.category}」推薦文）</h3>
            <div className="table-wrap"><table className="grid-table hist-table">
              <thead><tr><th scope="col">文章</th><th scope="col">有提到品牌</th><th scope="col">文中出現的品牌</th></tr></thead>
              <tbody>{sources.articles.map((x) => (
                <tr key={x.url} className="row-static"><th scope="row"><a href={x.url} target="_blank" rel="noreferrer">{x.title}</a><span className="hist-sub">{x.host}</span></th>
                  <td data-label="有提到品牌"><span className={`lv ${!x.ok ? 'lv-mid' : x.mentioned ? 'lv-good' : 'lv-bad'}`}>{!x.ok ? '讀不到' : x.mentioned ? `有（${(x as any).hits} 處）` : '沒有'}</span>{(x as any).context && <span className="hist-sub">「{(x as any).context}」</span>}</td>
                  <td data-label="文中出現的品牌">{x.brands.join('、') || '—'}</td></tr>
              ))}</tbody>
            </table></div>
          </>
        ) : null}
      </section>

      <section className="block" id="site">
        <div className="block-head"><h2>官網 SEO 結構分析</h2><p>{site?.reachable ? `抽查首頁與 ${site.pages.length} 個內頁` : `官網無法讀取（HTTP ${site?.status ?? '—'}）`}{speed?.ok && `；手機版 LCP ${((speed.lcp ?? 0) / 1000).toFixed(1)} 秒、CLS ${(speed.cls ?? 0).toFixed(3)}`}</p></div>
        <div className="platforms">
          <article className="plat-card"><h3>做得好的地方</h3><ul className="log">{s.good.length ? s.good.map((t) => <li key={t}>{t}</li>) : <li>—</li>}</ul></article>
          <article className="plat-card"><h3>做得不好的地方</h3><ul className="log">{s.bad.length ? s.bad.map((t) => <li key={t}>{t}</li>) : <li>—</li>}</ul></article>
          <article className="plat-card"><h3>AI 解讀風險</h3><ul className="log">{s.risk.length ? s.risk.map((t) => <li key={t}>{t}</li>) : <li>沒有明顯風險</li>}</ul></article>
        </div>
        {site?.reachable && (
          <details className="tableview"><summary>抽查頁面明細</summary>
            <table><thead><tr><th>頁面</th><th>標題</th><th>描述</th><th>結構化資料</th><th>可讀文字</th></tr></thead>
              <tbody>{[site.home, ...site.pages].map((p) => (
                <tr key={p.url}><td>{decodeURIComponent(p.url).replace(site.origin, '') || '/'}</td><td>{p.title || '（無）'}</td><td>{p.description ? `${p.description.length} 字` : '（無）'}</td><td>{p.schemaTypes.join('、') || '—'}</td><td>{p.textChars.toLocaleString()}</td></tr>
              ))}</tbody></table>
          </details>
        )}
      </section>

      <section className="block" id="serp">
        <div className="block-head"><h2>搜尋結果覆蓋</h2><p>搜尋品牌字時，前 10 筆是誰在說這個品牌。</p></div>
        {search?.queries.filter((q) => q.type === 'brand').map((q) => (
          <div key={q.q} className="serp">
            <div className="serp-q">搜尋：{q.q}</div>
            <ol>{q.hits.map((h, i) => <li key={i}><span className={`kind k-${h.kind}`}>{KIND_NAME[h.kind]}</span><a href={h.url} target="_blank" rel="noreferrer">{h.title}</a>{!h.brand && <span className="hist-sub">　（與品牌無關）</span>}</li>)}</ol>
          </div>
        ))}
      </section>

      <section className="block" id="comp">
        <div className="block-head"><h2>推薦情境中的競品</h2><p>{ai?.enabled ? 'Gemini 回答、' : ''}「{a.category || '品類'}」推薦搜尋結果與推薦文章內文中出現的其他品牌與次數。</p></div>
        {(() => {
          const m: Record<string, number> = {};
          search?.competitors.forEach((c) => (m[c.name] = (m[c.name] || 0) + c.n));
          if (ai?.enabled) ai.answers.filter((x) => x.type === 'recommend').forEach((x) => x.others.forEach((o) => (m[o] = (m[o] || 0) + 1)));
          sources?.articles.forEach((x) => x.brands.forEach((o) => (m[o] = (m[o] || 0) + 1)));
          const list = Object.entries(m).sort((x, y) => y[1] - x[1]).slice(0, 10);
          return list.length ? <ul className="kw">{list.map(([n, c]) => <li key={n}><span className="kw-w">{n}</span><span className="kw-bar"><span style={{ width: `${(c / list[0][1]) * 100}%` }} /></span><span className="num kw-n">{c}</span></li>)}</ul> : <p className="none">沒有足夠資料。</p>;
        })()}
      </section>

      <section className="block" id="social">
        <div className="block-head"><h2>社群口碑與影音</h2><p>近一年各平台被搜尋引擎收錄、提到品牌的貼文或影片（每平台最多看 10 筆）；本站論壇資料近 90 天提及 {social?.forum ?? 0} 篇。</p></div>
        <div className="platforms">{social?.sites.map((x) => (
          <article key={x.key} className="plat-card"><h3>{x.name}<span className="count">{x.count} 筆</span></h3>
            {x.samples.length ? <ul className="news">{x.samples.map((p) => <li key={p.url}><a href={p.url} target="_blank" rel="noreferrer">{p.title}</a>{p.date && <span className="src">{p.date}</span>}</li>)}</ul> : <p className="none">{x.status === 200 ? '沒有找到' : '搜尋失敗'}</p>}
          </article>
        ))}</div>
      </section>

      <section className="block" id="issues">
        <div className="block-head"><h2>最大問題點</h2><p>分數最低、最影響被 AI 推薦的項目。</p></div>
        <ol className="audit-issues">{s.issues.map((i) => <li key={i.name}><b>{i.name}（{i.score} 分）</b><p>{i.text}</p></li>)}</ol>
      </section>

      <section className="block" id="plan">
        <div className="block-head"><h2>90 天優化建議</h2></div>
        <div className="audit-stages">{s.stages.map((st) => (
          <article key={st.stage} className="plat-card"><div className="audit-eyebrow">{st.stage}</div><h3>{st.title}</h3><ul className="log">{st.items.map((t) => <li key={t}>{t}</li>)}</ul></article>
        ))}</div>
      </section>

      <section className="block" id="kw">
        <div className="block-head"><h2>最值得搶的關鍵字</h2><p>「已出現」＝搜尋前 10 筆標題有品牌；「文章內出現」＝標題沒有，但排名前面的推薦文章內文有列入；「待驗證」是建議經營、這次沒有搜尋的詞。</p></div>
        <div className="table-wrap"><table className="grid-table hist-table">
          <thead><tr><th scope="col">關鍵字</th><th scope="col">狀態</th><th scope="col">說明</th></tr></thead>
          <tbody>{s.keywords.map((k) => <tr key={k.keyword} className="row-static"><th scope="row">{k.keyword}</th><td data-label="狀態"><span className={`lv ${k.status === '已出現' ? 'lv-good' : k.status === '未出現' ? 'lv-bad' : 'lv-mid'}`}>{k.status}</span></td><td data-label="說明">{k.note}</td></tr>)}</tbody>
        </table></div>
      </section>

      <section className="block" id="final">
        <div className="block-head"><h2>最終結論</h2></div>
        <div className="platforms">
          <article className="plat-card"><h3>整體評估</h3><ul className="log">{s.summary.overall.map((t) => <li key={t}>{t}</li>)}</ul></article>
          <article className="plat-card"><h3>核心問題</h3><ul className="log">{s.summary.problems.map((t) => <li key={t}>{t}</li>)}</ul></article>
          <article className="plat-card"><h3>關鍵方向</h3><ul className="log">{s.summary.direction.map((t) => <li key={t}>{t}</li>)}</ul></article>
        </div>
      </section>

      <section className="block">
        <div className="block-head"><h2>重新健檢</h2><p>修改後再跑一次，報告會顯示和上次相比進步多少。</p></div>
        <AuditForm initial={{ brand: a.brand, url: a.url, category: a.category || '' }} />
      </section>
      <p className="foot">
        ※ 本報告依當次自動抓取的資料判讀：搜尋結果來自 DuckDuckGo，與 Google 排名可能不同；社群數為搜尋引擎收錄的公開貼文，不等於實際總量；「在地／商家資訊」未直接查 Google 商家檔案。
        {!ai?.enabled && ' AI 推薦測試需要 Gemini 免費金鑰：到 aistudio.google.com 建立 API key，在 Vercel 專案的 Environment Variables 新增 GEMINI_API_KEY 後重新部署即可。'}
      </p>
    </main>
  );
}
