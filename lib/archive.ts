// 保存活動歷史：每則活動記錄第一次／最後一次看到的日期；銀行優惠橫幅另存圖片
import { adminDb } from './db';
import { SITEWIDE, SITEWIDE_LINE } from './promo';

export async function logPromos(day: string) {
  const db = adminDb();
  const { data } = await db.from('ec_price_snapshots')
    .select('promos, ec_listings!inner(platform,line,spec,active)')
    .eq('captured_on', day).eq('status', 'ok');
  const map = new Map<string, { platform: string; line: string; text: string; period: string; specs: Set<string> }>();
  for (const row of (data || []) as any[]) {
    const l = row.ec_listings;
    if (!l?.line || !l.active) continue;
    for (const p of row.promos || []) {
      const line = SITEWIDE.test(p.text) ? SITEWIDE_LINE : l.line;
      const k = [l.platform, line, p.text, p.period || ''].join('|');
      if (!map.has(k)) map.set(k, { platform: l.platform, line, text: p.text, period: p.period || '', specs: new Set() });
      if (l.spec) map.get(k)!.specs.add(l.spec);
    }
  }
  const rows = Array.from(map.values()).map((r) => ({ ...r, specs: Array.from(r.specs), last_seen: day }));
  // first_seen 不放進資料：新活動用預設值（今天），舊活動保留原本的第一次出現日期
  if (rows.length) await db.from('ec_promo_log').upsert(rows, { onConflict: 'platform,line,text,period' });
  return rows.length;
}

export async function archiveBanners() {
  const db = adminDb();
  const { data } = await db.from('ec_platform_events').select('id,image_url').eq('kind', 'bank').is('archived_image_url', null).limit(30);
  let saved = 0;
  for (const e of data || []) {
    if (!e.image_url) continue;
    try {
      const r = await fetch(e.image_url, { cache: 'no-store' });
      if (!r.ok) continue;
      const type = r.headers.get('content-type') || 'image/png';
      const ext = type.includes('jpeg') ? 'jpg' : type.includes('webp') ? 'webp' : 'png';
      const path = `banners/${e.id}.${ext}`;
      const { error } = await db.storage.from('ec-archive').upload(path, await r.arrayBuffer(), { contentType: type, upsert: true });
      if (error) continue;
      const url = db.storage.from('ec-archive').getPublicUrl(path).data.publicUrl;
      await db.from('ec_platform_events').update({ archived_image_url: url }).eq('id', e.id);
      saved++;
    } catch {}
  }
  return saved;
}
