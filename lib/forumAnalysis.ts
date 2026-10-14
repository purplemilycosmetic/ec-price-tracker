// 論壇文章的關鍵字與議題分析（不需外部服務，規則＋斷詞）
export type Post = { url: string; source: string; board: string | null; lang: string; title: string; excerpt: string | null; pushes: number; posted_at: string };

// 名稱, 比對規則（合併同義寫法）
const T = (label: string, re: string): [string, RegExp] => [label, new RegExp(re, 'i')];
const TERMS: { group: string; items: [string, RegExp][] }[] = [
  { group: '品牌', items: [
    T('雅漾 Avène', '雅漾|av[eè]ne'), T('AHC', '\\bAHC\\b'), T('OLAY', 'olay|歐蕾'), T('理膚寶水', '理膚寶水|la roche|\\bLRP\\b'),
    T('薇姿', '薇姿|vichy'), T('SK-II', 'SK-?II|\\bSK2\\b'), T('蘭蔻', '蘭蔻|lanc[oô]me'), T('雅詩蘭黛', '雅詩蘭黛|est[ée]e lauder'),
    T('資生堂', '資生堂|shiseido'), T('DR.WU', 'dr\\.? ?wu'), T('適樂膚 CeraVe', '適樂膚|cerave'), T('倩碧', '倩碧|clinique'),
    T('契爾氏', '契爾氏|kiehl'), T('珂潤 Curel', '珂潤|curel'), T('貝德瑪', '貝德瑪|bioderma'), T('COSRX', 'cosrx'),
    T('Anua', '\\banua\\b'), T('Beauty of Joseon', 'beauty of joseon|\\bBOJ\\b'), T('Torriden', 'torriden'), T('Medicube', 'medicube'),
    T('Round Lab', 'round ?lab'), T('Skin1004', 'skin ?1004'), T('Laneige', 'laneige|蘭芝'), T('The Ordinary', 'the ordinary'), T("Paula's Choice", "paula'?s choice"),
  ] },
  { group: '成分', items: [
    T('玻尿酸', '玻尿酸|hyaluron'), T('神經醯胺', '神經醯胺|ceramide'), T('菸鹼醯胺', '菸鹼醯胺|煙醯胺|niacinamide'), T('維他命C', '維他命c|維生素c|vitamin c|ascorbic'),
    T('A醇／視黃醇', 'a醇|視黃醇|retino|tretinoin|adapalene'), T('水楊酸', '水楊酸|salicylic|\\bBHA\\b'), T('杏仁酸', '杏仁酸|mandelic'), T('果酸／AHA', '果酸|\\bAHA\\b|glycolic|lactic acid'),
    T('胜肽', '胜肽|肽|peptide'), T('傳明酸', '傳明酸|tranexamic'), T('積雪草', '積雪草|cica|centella'), T('B5／泛醇', '\\bB5\\b|泛醇|panthenol'),
    T('膠原蛋白', '膠原蛋白|collagen'), T('益生菌', '益生菌|probiotic'), T('PDRN／鮭魚', 'PDRN|鮭魚'), T('角鯊烷', '角鯊烷|squalane'), T('熊果素', '熊果素|arbutin'),
  ] },
  { group: '肌膚問題', items: [
    T('敏感肌', '敏感|sensitive|irritat|redness|泛紅'), T('痘痘／粉刺', '痘|粉刺|閉口|acne|pimple|breakout|comedone'), T('毛孔／黑頭', '毛孔|黑頭|pores|blackhead'),
    T('乾燥／保濕', '乾燥|乾肌|保濕|乾裂|dry|dehydrat|hydrat|moisturi[sz]'), T('出油／控油', '出油|控油|油肌|oily|sebum'), T('暗沉／斑', '暗沉|淡斑|斑點|痘印|hyperpigment|dark spot|melasma'),
    T('美白／提亮', '美白|提亮|透亮|brighten|whiten'), T('抗老／細紋', '抗老|皺紋|細紋|緊緻|anti-?ag|wrinkle|fine line'), T('刺痛／過敏', '刺痛|過敏|紅腫|burn|sting|allerg|reaction'),
    T('脫妝／卡粉', '脫妝|卡粉|搓泥|pilling|cakey'),
  ] },
  { group: '品類', items: [
    T('精華', '精華|serum|essence|ampoule'), T('乳液／乳霜', '乳液|乳霜|面霜|凝霜|cream|lotion|moisturizer'), T('化妝水／噴霧', '化妝水|噴霧|toner|mist'), T('防曬', '防曬|sunscreen|\\bSPF\\b|sunblock'),
    T('卸妝／洗臉', '卸妝|洗面|洗臉|潔顏|cleanser|cleansing'), T('面膜', '面膜|mask'), T('眼霜', '眼霜|eye cream'), T('底妝', '底妝|粉底|氣墊|遮瑕|foundation|concealer|cushion'),
    T('唇彩', '口紅|唇膏|唇釉|唇彩|lip'), T('眼妝', '眼影|眼線|睫毛|eyeshadow|mascara|eyeliner'), T('腮紅／修容', '腮紅|修容|blush|contour'), T('香水', '香水|perfume|fragrance'),
  ] },
  { group: '購物', items: [
    T('週年慶', '週年慶|周年慶'), T('雙11', '雙11|雙十一|double 11|11\\.11'), T('折扣／優惠', '折扣|優惠|特價|促銷|買一送一|買.送.|\\bsale\\b|discount|deal'), T('回購／空瓶', '回購|空瓶|repurchase|empty|hit pan'),
    T('踩雷／雷品', '踩雷|雷品|地雷|退貨|flop|disappoint|waste'), T('平價／開架', '平價|開架|藥妝|drugstore'), T('專櫃', '專櫃'), T('CP值', 'cp值|cp 值|性價比|worth'),
    T('屈臣氏', '屈臣氏|watsons'), T('康是美', '康是美'), T('寶雅', '寶雅'), T('蝦皮', '蝦皮|shopee'), T('momo', '\\bmomo\\b'), T('酷澎', '酷澎|coupang'), T('絲芙蘭 Sephora', '絲芙蘭|sephora'), T('iHerb', 'iherb'),
  ] },
];

const TOPICS: { label: string; hint: string; re: RegExp; titleOnly?: boolean }[] = [
  { label: '敏感肌、泛紅與修復', hint: '舒緩、屏障修復、刺痛過敏', re: /敏感|泛紅|刺痛|過敏|紅腫|屏障|修復|舒緩|sensitive|redness|irritat|barrier|sting|allerg|soothing|reaction/i },
  { label: '痘痘、毛孔與控油', hint: '痘痘粉刺、毛孔黑頭、出油', re: /痘|粉刺|閉口|毛孔|黑頭|出油|控油|acne|pimple|breakout|pores|blackhead|oily|sebum/i },
  { label: '保濕與乾燥', hint: '乾肌、補水、保濕', re: /保濕|乾燥|乾肌|補水|乾裂|dry|hydrat|moisturi[sz]|dehydrat/i },
  { label: '美白、淡斑與暗沉', hint: '美白提亮、痘印色沈', re: /美白|淡斑|暗沉|提亮|透亮|痘印|色沈|色素|brighten|whiten|dark spot|hyperpigment|melasma|\bPIE\b|\bPIH\b/i },
  { label: '抗老與緊緻', hint: '細紋皺紋、A醇、胜肽', re: /抗老|皺紋|細紋|緊緻|A醇|視黃醇|胜肽|anti-?ag|wrinkle|fine line|retino|peptide/i },
  { label: '防曬', hint: '防曬乳、曬後修復', re: /防曬|sunscreen|\bSPF\b|sunblock|\bPA\+/i },
  { label: '成分與功效討論', hint: '成分安全性、濃度、搭配', re: /成分|濃度|酸類|玻尿酸|菸鹼醯胺|煙醯胺|維他命c|vitamin c|niacinamide|ceramide|ingredient|retinol|\bAHA\b|\bBHA\b|acid/i },
  { label: '底妝、彩妝與色號', hint: '粉底氣墊、唇眼腮紅、試色', re: /底妝|粉底|氣墊|遮瑕|口紅|唇膏|唇釉|眼影|眼線|睫毛|腮紅|修容|試色|色號|foundation|concealer|lipstick|eyeshadow|blush|swatch|shade/i },
  { label: '價格、優惠與檔期', hint: '週年慶、雙11、折扣、比價', re: /週年慶|周年慶|雙11|雙十一|折扣|優惠|特價|促銷|買一送|比價|價格|便宜|貴|sale|discount|price|deal|cheap|expensive/i },
  { label: '通路與購買管道', hint: '屈臣氏、康是美、蝦皮、momo、專櫃', re: /屈臣氏|康是美|寶雅|蝦皮|momo|酷澎|專櫃|代購|藥妝|絲芙蘭|iherb|sephora|watsons|shopee|coupang|retailer/i },
  { label: '踩雷、退貨與負評', hint: '雷品、不適用、退貨', re: /踩雷|雷品|地雷|退貨|不推|失望|後悔|flop|disappoint|waste|regret|return(ed)?\b|not worth/i },
  { label: '回購與愛用推薦', hint: '空瓶、回購、愛用、推薦', re: /回購|空瓶|愛用|推薦|必買|神|holy grail|\bHG\b|repurchase|favorite|love|recommend|hit pan/i },
  { label: '新品與情報', hint: '新品上市、限定組、聯名', re: /新品|情報|上市|限定|聯名|新色|launch|new release|limited|collab/i },
  { label: '疑問求助', hint: '標題在求推薦、請益、問怎麼辦', re: /請益|求推薦|求助|請問|怎麼辦|推薦嗎|？|\?|help|advice|recommendations?\b|should i|anyone/i, titleOnly: true },
];

const ZH_STOP = new Set(('發信 踢踢 實業 來自 文章 網址 批踢踢 作者 看板 標題 時間 轉錄 引述 編輯 修改 我們 你們 他們 自己 這個 那個 這樣 那樣 什麼 怎麼 可以 因為 所以 但是 如果 還是 或是 已經 真的 現在 今天 昨天 明天 最近 一個 一些 有點 非常 比較 其實 覺得 感覺 大家 有人 請問 想問 問題 心得 推薦 閒聊 討論 分享 請益 情報 美妝 保養 產品 使用 看到 知道 之前 之後 時候 應該 需要 不會 沒有 不是 就是 還有 而且 真是 不要 看看 一下 一直 然後 的話 起來 出來 下來 上面 下面 以前 現在 目前 可能 通常 大概 好像 希望 謝謝 各位 板友 版友 請教 求助 版上 板上 問卷 關於 對於 一樣 不同 其他 另外 這種 那種 這邊 那邊 開始 繼續 一定 完全 特別 稍微 有沒有 是不是 能不能 要不要 好用 不好 不錯').split(/\s+/));
const EN_STOP = new Set(('https http www com reddit amp years year skincare makeup comments comment submitted link post posted day days week weeks month months the and for that this with you your have has had are was were but not what when which who how why can could would should will just like get got use used using one two any all out our from they them their there here about into over than then also some more most much very really too its it\'s i\'m i\'ve don\'t doesn\'t didn\'t isn\'t can\'t not does did been being being than only other such these those after before because while still even well make made want need know think look looks feel feels tried try trying since being skin product products help please thanks thank anyone does routine new best good great love hate between around every each many same another something someone everything anything').split(/\s+/));

let seg: Intl.Segmenter | null = null;
function words(text: string, lang: string): string[] {
  if (lang === 'en') return (text.toLowerCase().match(/[a-z][a-z'-]{2,}/g) || []).filter((w) => !EN_STOP.has(w));
  seg ||= new Intl.Segmenter('zh-TW', { granularity: 'word' });
  const out: string[] = [];
  for (const s of Array.from(seg.segment(text))) {
    if (!s.isWordLike) continue;
    const w = s.segment;
    if (/^[一-鿿]{2,6}$/.test(w) && !ZH_STOP.has(w)) out.push(w);
    else if (/^[A-Za-z][A-Za-z-]{2,}$/.test(w) && !EN_STOP.has(w.toLowerCase())) out.push(w.toLowerCase());
  }
  return out;
}

export type Counted = { w: string; n: number };
export type Analysis = {
  total: number;
  terms: { group: string; list: Counted[] }[];
  other: Counted[];
  topics: { label: string; hint: string; n: number; posts: Post[] }[];
  top: Post[];
};

// 內文：去掉網址與 PTT 發信站之後的樣板文字
const clean = (t: string) => t.replace(/https?:\/\/\S+/g, ' ').split(/※ ?發信站/)[0];
const text = (p: Post) => `${p.title}\n${clean(p.excerpt || '')}`;

export function analyze(posts: Post[]): Analysis {
  const termHits = TERMS.map((g) => ({ group: g.group, list: g.items.map(([w, re]) => ({ w, n: posts.filter((p) => re.test(text(p))).length })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 14) }));
  const known = new Set(TERMS.flatMap((g) => g.items.map(([w]) => w.toLowerCase())));
  const df = new Map<string, number>();
  for (const p of posts) for (const w of Array.from(new Set(words(text(p), p.lang)))) df.set(w, (df.get(w) || 0) + 1);
  const min = posts.length > 80 ? 4 : posts.length > 25 ? 3 : 2;
  const other = Array.from(df.entries()).filter(([w, n]) => n >= min && !known.has(w)).map(([w, n]) => ({ w, n })).sort((a, b) => b.n - a.n).slice(0, 36);
  const rank = (a: Post, b: Post) => b.pushes - a.pushes || b.posted_at.localeCompare(a.posted_at);
  const topics = TOPICS.map((t) => {
    const ps = posts.filter((p) => t.re.test(t.titleOnly ? p.title : text(p))).sort(rank);
    return { label: t.label, hint: t.hint, n: ps.length, posts: ps.slice(0, 5) };
  }).filter((t) => t.n > 0).sort((a, b) => b.n - a.n);
  return { total: posts.length, terms: termHits, other, topics, top: [...posts].sort(rank).slice(0, 10) };
}

// 追蹤產品的品牌相關討論
export function mentions(posts: Post[], re: RegExp) {
  return posts.filter((p) => re.test(text(p))).sort((a, b) => b.posted_at.localeCompare(a.posted_at));
}
