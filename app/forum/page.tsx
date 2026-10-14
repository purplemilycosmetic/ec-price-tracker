import { adminDb, todayTaipei, addDays, fetchAll } from '@/lib/db';
import { analyze, mentions, type Post, type Counted } from '@/lib/forumAnalysis';
import { PLATFORMS, SOURCE_IDS, platformOf, sourceName } from '@/lib/forum';
import { PRODUCTS } from '@/lib/classify';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const isDay = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const md = (iso: string) => new Date(new Date(iso).getTime() + 8 * 3600_000).toISOString().slice(5, 10).replace('-', '/');
const BRANDS = [
  { name: '雅漾 Avène', re: /雅漾|av[eè]ne/i },
  { name: 'AHC', re: /\bAHC\b/i },
  { name: 'OLAY', re: /olay|歐蕾/i },
];

function Chips({ list, max }: { list: Counted[]; max: number }) {
  return (
    <ul className="kw">
      {list.map((k) => (
        <li key={k.w}><span className="kw-w">{k.w}</span><span className="kw-bar"><span style={{ width: `${Math.max(8, (k.n / max) * 100)}%` }} /></span><span className="num kw-n">{k.n}</span></li>
      ))}
    </ul>
  );
}

function PostLine({ p }: { p: Post }) {
  return (
    <li>
      <a href={p.url} target="_blank" rel="noreferrer">{p.title}</a>
      <span className="src">{sourceName(p.source)}，{md(p.posted_at)}{p.pushes > 0 && `，${platformOf(p.source) === 'threads' ? '讚' : '推'} ${p.pushes}`}</span>
    </li>
  );
}

export default async function Forum({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const today = todayTaipei();
  let to = isDay(searchParams.to) ? searchParams.to! : today;
  let from = isDay(searchParams.from) ? searchParams.from! : addDays(to, -6);
  if (from > to) [from, to] = [to, from];
  const src = PLATFORMS.find((p) => p.key === searchParams.src)?.key || '';
  const db = adminDb();
  const posts = (await fetchAll((a, b) => {
    let q = db.from('ec_forum_posts').select('url,source,board,lang,title,excerpt,pushes,posted_at')
      .gte('posted_at', from + 'T00:00:00+08:00').lte('posted_at', to + 'T23:59:59+08:00');
    q = src ? q.in('source', SOURCE_IDS.filter((id) => platformOf(id) === src)) : q.in('source', SOURCE_IDS);
    return q.order('posted_at', { ascending: false }).order('url').range(a, b);
  }).catch(() => [])) as Post[];
  const { data: first } = await db.from('ec_forum_posts').select('posted_at').in('source', SOURCE_IDS).order('posted_at').limit(1);
  const a = analyze(posts);
  const link = (patch: Record<string, string>) => '/forum?' + new URLSearchParams({ from, to, ...(src && { src }), ...patch }).toString();
  const presets = [
    { label: '近 3 天', from: addDays(today, -2) }, { label: '近 7 天', from: addDays(today, -6) },
    { label: '近 30 天', from: addDays(today, -29) }, { label: '近 90 天', from: addDays(today, -89) },
  ];
  const counts = PLATFORMS.map((p) => ({ p, n: posts.filter((x) => platformOf(x.source) === p.key).length }));
  // 各平台各自的熱門關鍵字
  const perPlatform = PLATFORMS.map((p) => {
    const ps = posts.filter((x) => platformOf(x.source) === p.key);
    const top = analyze(ps).terms.flatMap((g) => g.list).sort((a, b) => b.n - a.n).slice(0, 10);
    return { p, n: ps.length, top };
  });
  const termMax = Math.max(1, ...a.terms.flatMap((g) => g.list.map((k) => k.n)));
  const otherMax = Math.max(1, ...a.other.map((k) => k.n));

  return (
    <main className="page">
      <section className="search-head">
        <h1 className="display">論壇美妝評論</h1>
        <p className="lede">
          每小時彙整 PTT、Dcard、Threads、Instagram、Facebook 上的台灣美妝保養討論，整理出大家在聊的關鍵字與議題。
          {first?.[0] && <>資料從 {md(first[0].posted_at)} 開始累積。</>}
        </p>
      </section>

      <form className="hist-form" action="/forum">
        <label>開始日期<input type="date" name="from" defaultValue={from} max={today} /></label>
        <label>結束日期<input type="date" name="to" defaultValue={to} max={today} /></label>
        <label>平台
          <select name="src" defaultValue={src}>
            <option value="">全部</option>
            {PLATFORMS.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
          </select>
        </label>
        <button className="primary" type="submit">查詢</button>
      </form>
      <div className="seg presets" role="group" aria-label="快速選擇期間">
        {presets.map((p) => <a key={p.label} className={from === p.from && to === today ? 'on' : ''} href={link({ from: p.from, to: today })}>{p.label}</a>)}
      </div>

      <p className="foot">
        {from} 到 {to}，共 {a.total} 篇討論。{counts.filter((c) => c.n).map((c) => `${c.p.name} ${c.n}`).join('、')}
      </p>

      {a.total === 0 ? (
        <p className="empty">這段期間還沒有資料。每小時自動抓取，首次資料會在下一次更新後出現。</p>
      ) : (
        <>
          <section className="block">
            <div className="block-head"><h2>熱門關鍵字</h2><p>數字是有提到該詞的文章數（標題加內文開頭）。同義詞（例如煙醯胺、菸鹼醯胺）已合併。</p></div>
            <div className="platforms">
              {a.terms.filter((g) => g.list.length).map((g) => (
                <article key={g.group} className="plat-card"><h3>{g.group}</h3><Chips list={g.list} max={termMax} /></article>
              ))}
              {a.other.length > 0 && <article className="plat-card"><h3>其他常見詞</h3><Chips list={a.other.slice(0, 16)} max={otherMax} /></article>}
            </div>
          </section>

          <section className="block">
            <div className="block-head"><h2>各平台關鍵字</h2><p>各平台被提到最多的品牌、成分、肌膚問題與品類。</p></div>
            <div className="platforms">
              {perPlatform.map(({ p, n, top }) => (
                <article key={p.key} className="plat-card">
                  <h3>{p.name}<span className="count">{n} 篇</span></h3>
                  {top.length ? <Chips list={top} max={Math.max(1, ...top.map((k) => k.n))} /> : <p className="none">這段期間沒有資料</p>}
                </article>
              ))}
            </div>
          </section>

          <section className="block">
            <div className="block-head"><h2>討論議題</h2><p>依文章內容歸類，一篇可以屬於多個議題；每個議題列出推文數較高的代表文章。</p></div>
            <div className="platforms">
              {a.topics.map((t) => (
                <article key={t.label} className="plat-card">
                  <h3>{t.label}<span className="count">{t.n} 篇</span></h3>
                  <p className="hist-sub">{t.hint}</p>
                  <ul className="news">{t.posts.map((p) => <PostLine key={p.url} p={p} />)}</ul>
                </article>
              ))}
            </div>
          </section>

          <section className="block">
            <div className="block-head"><h2>提到追蹤品牌的討論</h2><p>標題或內文提到 {PRODUCTS.map((p) => p.brand.split(' ')[0]).filter((v, i, arr) => arr.indexOf(v) === i).join('、')} 的文章。</p></div>
            <div className="platforms">
              {BRANDS.map((b) => {
                const ms = mentions(posts, b.re);
                return (
                  <article key={b.name} className="plat-card">
                    <h3>{b.name}<span className="count">{ms.length} 篇</span></h3>
                    {ms.length ? <ul className="news">{ms.slice(0, 8).map((p) => <PostLine key={p.url} p={p} />)}</ul> : <p className="none">這段期間沒有討論</p>}
                  </article>
                );
              })}
            </div>
          </section>

          <section className="block">
            <div className="block-head"><h2>熱門文章</h2><p>PTT 以推文數、Threads 以按讚數排序；Dcard、IG、FB 取自搜尋摘要，沒有互動數。</p></div>
            <ul className="news top-list">{a.top.map((p) => <PostLine key={p.url} p={p} />)}</ul>
          </section>
        </>
      )}
      <p className="foot">來源：PTT 經 PTT 網頁版讀取；Threads 讀取公開搜尋結果；Dcard、Instagram、Facebook 會擋雲端主機或需要登入，改用搜尋引擎近一週收錄的貼文標題與摘要，只涵蓋公開且被收錄的貼文。關鍵字與議題由規則與斷詞自動歸類，僅供趨勢參考。</p>
    </main>
  );
}
