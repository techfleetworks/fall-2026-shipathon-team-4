/**
 * Sets up Theo (synthetic demo patient) on the server (ADR-010). Safe to run again: it finds Theo and
 * refreshes his record (e.g. after Diana changes src/data/demo.ts).
 *
 *   npm run seed:theo          (reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local)
 *
 * 1. Finds or creates Theo's account (theo.demo@example.com).
 * 2. Password: set from THEO_DEMO_PASSWORD in .env.local (you choose it; at least 12 characters) so the team can
 *    log in and out as Theo. Without it, Theo has no password and can't be logged into (Explore still works).
 * 3. Writes his app record (Diana's demo data + transcript recap) as the ONE public demo record.
 * Prints only counts, never keys or the password.
 */
import { createClient } from '@supabase/supabase-js';
import { buildTheoRecord, THEO_DEMO_EMAIL } from '../server/demo/theoRecord.js';

const url = process.env.SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (see docs/SUPABASE_SETUP.md).');
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function findTheo(): Promise<string | undefined> {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`could not list users (${error.status ?? 'error'})`);
    const hit = data.users.find((u) => u.email?.toLowerCase() === THEO_DEMO_EMAIL);
    if (hit) return hit.id;
    if (data.users.length < 200) return undefined;
  }
  return undefined;
}

let theoId = await findTheo();
if (theoId) {
  console.log('Theo’s account already exists: refreshing his record.');
} else {
  const { data, error } = await db.auth.admin.createUser({
    email: THEO_DEMO_EMAIL,
    email_confirm: true, // no inbox exists at example.com, so no email step; the password (if any) is set below
    user_metadata: { first_name: 'Theo', last_name: 'Marsh' },
    app_metadata: { role: 'public-demo', synthetic: true },
  });
  if (error || !data.user) throw new Error(`could not create Theo (${error?.status ?? 'error'})`);
  theoId = data.user.id;
  console.log('Created Theo’s account.');
}

const password = process.env.THEO_DEMO_PASSWORD ?? '';
if (password) {
  if (password.length < 12) throw new Error('THEO_DEMO_PASSWORD must be at least 12 characters.');
  const { error: pwError } = await db.auth.admin.updateUserById(theoId, { password, app_metadata: { role: 'public-demo', synthetic: true } });
  if (pwError) throw new Error(`could not set Theo's password (${pwError.status ?? 'error'})`);
  console.log('Theo’s password set from THEO_DEMO_PASSWORD (not shown). The team can log in as Theo.');
} else {
  console.log('No THEO_DEMO_PASSWORD in .env.local: Theo has no password, so nobody can log in as him (Explore still works).');
}

const record = buildTheoRecord();
const { error } = await db
  .from('app_state')
  .upsert({ user_id: theoId, data: record, anchor_date: new Date().toISOString().slice(0, 10), is_public_demo: true }, { onConflict: 'user_id' });
if (error) throw new Error(`could not write Theo's record (${error.code ?? 'error'}: ${error.message})`);

const visits = (record.visits as { recap?: unknown }[]) ?? [];
console.log(
  `Theo's record saved as the public demo: ${visits.length} visits (${visits.filter((v) => v.recap).length} with a transcript recap), ` +
    `${(record.evidence as unknown[]).length} timeline items, ${(record.summaries as unknown[]).length} saved story.`,
);
