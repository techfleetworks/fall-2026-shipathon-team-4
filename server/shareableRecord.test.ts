import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTheoRecord } from './demo/theoRecord.js';
import { buildCaseSnapshot } from '../src/lib/caseView/snapshot.js';
import type { CaseInputs } from '../src/lib/caseView/caseView.js';
import { todayISO } from '../src/lib/dates.js';
import type { BriefSnapshot, CaseSnapshot } from '../src/lib/types.js';
import { CRISIS_HELP, createApp } from './app.js';
import type { AuthConfig } from './auth.js';
import { encryptJson, recordKeysFromEnv, SHARE_CONTEXT } from './records/crypto.js';
import { CASE_PAGE, buildOnePageBrief } from './shares/brief.js';
import { encryptedShareStore } from './shares/encrypted.js';
import { hashToken, memoryShareStore, shareStoreFromEnv } from './shares/store.js';

const auth: AuthConfig = { required: true, verifyToken: async (t) => (t === 'alice.token' ? { id: 'alice' } : null) };
const keyB64 = () => randomBytes(32).toString('base64');
const pcp = { name: 'Dr. Lane', role: 'Primary care', email: 'lane@clinic.example', clinic: 'Riverside Clinic' };

const theoCase = (): CaseSnapshot => buildCaseSnapshot(buildTheoRecord() as unknown as CaseInputs, todayISO())!;
const brief = (c?: CaseSnapshot): BriefSnapshot => ({
  who: 'Theo, 30',
  priorities: ['Daytime sleepiness since the dose change'],
  symptoms: [{ label: 'Reported', clinical: 'Over-sedation / excessive daytime somnolence' }],
  tried: 'Ziprasidone, dose increased',
  timeline: [],
  askingFor: [],
  demo: true,
  ...(c ? { case: c } : {}),
});

function setup() {
  const inner = memoryShareStore();
  const keys = recordKeysFromEnv({ RECORD_ENCRYPTION_KEY: keyB64() })!;
  const app = createApp({ auth, shares: encryptedShareStore(inner, keys) });
  const share = (body: unknown) => request(app).post('/api/shares').set('Authorization', 'Bearer alice.token').send(body as object);
  const doctor = (path: string) => request(app).get(`/api${path}`);
  const tokenHashOf = (path: string) => hashToken(path.split('/').pop()!);
  return { inner, keys, app, share, doctor, tokenHashOf };
}

describe('the case snapshot (what the doctor gets)', () => {
  it("Theo's: clinical lines only, with past visits", () => {
    const c = theoCase();
    expect(c.presenting).toContain('Over-sedation / excessive daytime somnolence');
    expect(c.course[0]).toBe('Onset: 5 weeks, began after a medication change');
    expect(c.patterns[0]).toMatch(/^Symptom onset .*Temporal association only\.$/);
    expect(c.visits).toEqual([{ date: expect.any(String), clinician: 'Dr. Lane', feltHeard: 2 }]);
    expect(JSON.stringify(c)).not.toMatch(/You've|You felt|"id"/); // no plain "you" lines, no entry ids
  });

  it('no snapshot when there is not enough history (a new user)', () => {
    expect(buildCaseSnapshot({ medications: [], evidence: [], visits: [], followUps: [] }, todayISO())).toBeUndefined();
  });
});

describe('server checks for the case history', () => {
  it('keeps a valid case, and caps each list', () => {
    const many = { ...theoCase(), patterns: Array.from({ length: 9 }, (_, i) => `Pattern ${i}`) };
    const out = buildOnePageBrief(brief(many));
    expect(out.ok && out.brief.case!.patterns).toHaveLength(CASE_PAGE.patterns.max);
    expect(out.ok && out.trimmed).toBe(true);
  });

  it('an empty case section is dropped, not shared', () => {
    const out = buildOnePageBrief(brief({ presenting: [], course: [], medications: [], patterns: [], openItems: [], keyDates: [], visits: [] }));
    expect(out.ok && out.brief.case).toBeUndefined();
  });

  it.each([
    ['not an object', 'x'],
    ['a key date with a bad date', { keyDates: [{ date: 'Oct 1', text: 'x' }] }],
    ['felt heard out of range', { visits: [{ date: '2026-11-01', feltHeard: 9 }] }],
    ['a list that is not a list', { patterns: 'x' }],
  ])('rejects a case that is %s', (_n, c) => {
    expect(buildOnePageBrief({ ...brief(), case: c })).toEqual({ ok: false, reason: 'invalid' });
  });

  it('crisis language in the case history → not shared', () => {
    expect(buildOnePageBrief(brief({ ...theoCase(), patterns: ['I want to hurt myself'] }))).toEqual({ ok: false, reason: 'crisis' });
  });
});

describe('POST /api/shares + GET /api/shared/:token with the shareable record', () => {
  it('the doctor sees the case history exactly as frozen', async () => {
    const { share, doctor } = setup();
    const c = theoCase();
    const made = await share({ brief: brief(c), recipient: pcp, days: 7 });
    expect(made.status).toBe(201);
    const seen = await doctor(made.body.path);
    expect(seen.status).toBe(200);
    expect(seen.body.brief.case).toEqual(c);
  });

  it('what is stored is encrypted: no health words in the stored brief', async () => {
    const { share, inner, tokenHashOf } = setup();
    const made = await share({ brief: brief(theoCase()), recipient: pcp, days: 7 });
    const stored = await inner.findByTokenHash(tokenHashOf(made.body.path));
    expect(JSON.stringify(stored!.brief)).not.toMatch(/somnolence|Ziprasidone|Lane|Theo/);
    expect(stored!.brief).toHaveProperty('sealed');
  });

  it('older plain briefs (made before encryption) still open', async () => {
    const inner = memoryShareStore();
    const keys = recordKeysFromEnv({ RECORD_ENCRYPTION_KEY: keyB64() })!;
    const legacyHash = hashToken('L'.repeat(43));
    await inner.create('alice', pcp as never, brief(), legacyHash, new Date(Date.now() + 86_400_000));
    const app = createApp({ auth, shares: encryptedShareStore(inner, keys) });
    const res = await request(app).get(`/api/shared/${'L'.repeat(43)}`);
    expect(res.status).toBe(200);
    expect(res.body.brief.who).toBe('Theo, 30');
  });

  it('a sealed brief bound to a different link cannot be opened', async () => {
    const inner = memoryShareStore();
    const keys = recordKeysFromEnv({ RECORD_ENCRYPTION_KEY: keyB64() })!;
    const token = 'T'.repeat(43);
    const sealedForOther = { sealed: encryptJson(brief(theoCase()), SHARE_CONTEXT(hashToken('O'.repeat(43))), keys) };
    await inner.create('alice', pcp as never, sealedForOther as never, hashToken(token), new Date(Date.now() + 86_400_000));
    const app = createApp({ auth, shares: encryptedShareStore(inner, keys) });
    const res = await request(app).get(`/api/shared/${token}`);
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/somnolence|Theo/);
  });

  it('crisis language in the case history: nothing is shared', async () => {
    const { share } = setup();
    const res = await share({ brief: brief({ ...theoCase(), openItems: ['I want to end my life'] }), recipient: pcp, days: 7 });
    expect(res.body).toEqual({ status: 'crisis', help: CRISIS_HELP });
  });
});

describe('sharing fails closed without the encryption key', () => {
  const DB = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-key' };
  it('is off with a database but no key', () => {
    expect(shareStoreFromEnv(DB)).toBeUndefined();
  });
  it('is on with a database and a key', () => {
    expect(shareStoreFromEnv({ ...DB, RECORD_ENCRYPTION_KEY: keyB64() })).toBeDefined();
  });
});
