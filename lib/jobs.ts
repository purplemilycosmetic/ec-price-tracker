// 抓取紀錄：每天每個工作（例如某個搜尋關鍵字）是否已成功，用來決定每小時要補抓哪些
import { adminDb } from './db';

export type JobState = { ok: boolean; attempts: number };

export async function jobLog(day: string, prefix: string) {
  const { data } = await adminDb().from('ec_fetch_log').select('job,ok,attempts').eq('day', day).like('job', prefix + '%');
  return new Map((data || []).map((r) => [r.job as string, { ok: r.ok as boolean, attempts: r.attempts as number }]));
}

export async function logJob(day: string, job: string, r: { ok: boolean; status: number; items: number }, cache?: Map<string, JobState>) {
  const prev = cache?.get(job);
  const ok = r.ok || !!prev?.ok; // 今天成功過就維持成功
  const attempts = (prev?.attempts ?? 0) + 1;
  cache?.set(job, { ok, attempts });
  await adminDb().from('ec_fetch_log').upsert(
    { day, job, ok, status: r.status, items: r.items, attempts, updated_at: new Date().toISOString() },
    { onConflict: 'day,job' },
  );
}
