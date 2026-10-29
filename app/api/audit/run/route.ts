import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/db';
import { aliasesOf } from '@/lib/audit/common';
import { auditSite } from '@/lib/audit/site';
import { auditSpeed } from '@/lib/audit/speed';
import { auditSearch } from '@/lib/audit/search';
import { auditSocial } from '@/lib/audit/social';
import { auditAi } from '@/lib/audit/ai';
import { auditSources } from '@/lib/audit/sources';
import { scoreAudit } from '@/lib/audit/score';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 執行一個階段：site／speed／search／social／ai，最後 score 彙整評分
export async function POST(req: NextRequest) {
  const b = await req.json();
  if (!process.env.ADMIN_KEY || b.key !== process.env.ADMIN_KEY) return NextResponse.json({ error: '管理密碼錯誤' }, { status: 401 });
  const db = adminDb();
  const { data: a } = await db.from('ec_brand_audits').select('*').eq('id', b.id).single();
  if (!a) return NextResponse.json({ error: '找不到這份健檢' }, { status: 404 });
  const aliases = aliasesOf(a.brand);
  const category = a.category || '';
  const stage = String(b.stage);
  try {
    let val: unknown;
    if (stage === 'site') val = await auditSite(a.url);
    else if (stage === 'speed') val = await auditSpeed(a.url);
    else if (stage === 'search') val = await auditSearch(a.brand, aliases, a.url, category, a.result?.search);
    else if (stage === 'social') val = await auditSocial(a.brand, aliases, a.result?.social);
    else if (stage === 'ai') val = await auditAi(a.brand, aliases, category);
    else if (stage === 'sources') val = await auditSources(a.result?.search, aliases);
    else if (stage === 'score') {
      const s = scoreAudit(a.brand, category, a.result || {});
      await db.from('ec_brand_audits').update({ status: 'done', score: s.score, grade: s.grade, updated_at: new Date().toISOString() }).eq('id', a.id);
      await db.rpc('ec_audit_merge', { p_id: a.id, p_key: 'scored', p_val: s });
      return NextResponse.json({ ok: true, score: s.score });
    } else return NextResponse.json({ error: '未知階段' }, { status: 400 });
    await db.rpc('ec_audit_merge', { p_id: a.id, p_key: stage, p_val: val as any });
    // 有平台或關鍵字這次沒查到，前端會自動再補查一次
    const v = val as any;
    const missing = stage === 'social' ? v.sites.filter((x: any) => x.status !== 200).length : stage === 'search' ? v.queries.filter((x: any) => x.status !== 200).length : 0;
    return NextResponse.json({ ok: true, missing });
  } catch (e) {
    await db.rpc('ec_audit_merge', { p_id: a.id, p_key: stage + '_error', p_val: String(e).slice(0, 300) as any });
    return NextResponse.json({ error: String(e).slice(0, 200) }, { status: 500 });
  }
}
