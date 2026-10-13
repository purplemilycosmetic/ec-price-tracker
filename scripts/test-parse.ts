import { classify } from '../lib/classify';
import { htmlToText } from '../lib/scrapers';
for (const t of ['【Avene 雅漾】官方直營 舒護活泉水 300ml(化妝水/噴霧)','【Avene 雅漾】官方直營 舒護活泉水300mlx3入(保濕化妝水/妝前噴霧)','【Avene 雅漾】官方直營 活泉舒緩卸妝凝膠200ml','【AHC】醫美科研 超導水光玻尿酸精華40ml(HA精華 B5保濕)','【AHC】超導水光玻尿酸活膚霜50ml','【AHC】玻尿酸原液 30ml 2入組','【OLAY 歐蕾】膠原大紅瓶★超值3入組高效緊緻乳霜50g★No.1抗老品牌(送14gx12)','【OLAY 歐蕾】新生高效緊緻眼霜15g'])
  console.log(JSON.stringify(classify(t)), t);
// momo 頁面文字片段模擬
const html = `<div><span>10/13~10/18</span><span>85折</span></div><p>滿1件享85折</p><dl><dt>限時折後價</dt><dd>$<b>499</b>元</dd><dt>市售價</dt><dd>$<del>650</del>元</dd><dt>促銷價</dt><dd>$588元</dd></dl><p>刷mo卡享3%，回饋上限翻倍至2千</p>`;
const text = htmlToText(html);
const after = (label: string) => text.match(new RegExp(`${label}\\s*\\n?\\s*\\$?\\s*\\n?\\s*([\\d,]+)`))?.[1];
console.log(text.replace(/\n/g,' | '), after('限時折後價'), after('市售價'), after('促銷價'));
