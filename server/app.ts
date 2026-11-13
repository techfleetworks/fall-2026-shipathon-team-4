/**
 * Appointment Ready API (name from src/lib/brand.ts): the Express app.
 *
 * Runs two ways from the same code:
 *  - on Vercel, as a serverless function (api/index.ts exports this app), and
 *  - on your computer, as a normal server (server/dev.ts listens on a port).
 *
 * Rules every route follows:
 *  - Never log request bodies: transcripts may contain health details.
 *  - Always answer in JSON, including errors, with fixed messages (no echo of user input).
 *  - Same origin as the web app, so no CORS is enabled on purpose.
 *
 * Imports use .js extensions so Node's ES module loader finds them on Vercel.
 */
import express, { type NextFunction, type Request, type Response } from 'express';
import { APP_NAME } from '../src/lib/brand.js';
import { CRISIS_DETECTED_RESOURCES, DISCLAIMERS, crisisMessageText } from '../src/lib/guardrails/copy.js';
import { MAX_EXPLAIN_CHARS, explainClinical } from '../src/lib/explain/explain.js';
import { LABS_NOTE, MAX_LAB_FIELD_CHARS, MAX_LAB_ROWS, type LabRow } from '../src/lib/labs/labs.js';
import { explainResults } from '../src/lib/labs/results.js';
import { SYNTHETIC_LABEL } from '../src/lib/transcript/constants.js';
import { processTranscript } from '../src/lib/transcript/intake.js';
import { summarizeNotes, summarizeVisit } from '../src/lib/afterVisit/summary.js';
import { extractActionItems } from '../src/lib/afterVisit/actionItems.js';
import { clinicianSpeakers, doctorSaidFrom } from '../src/lib/transcript/recap.js';
import { authConfigFromEnv, requireUser, type AuthConfig, type AuthUser } from './auth.js';
import { mappingEngineFromEnv } from './mapping/config.js';
import { daysBetween, safeDemoData, shiftDates } from './demo/publicDemo.js';
import { demoSourceFromEnv, type DemoSource } from './demo/source.js';
import { buildOnePageBrief } from './shares/brief.js';
import { shareNotifierFromEnv, type ShareNotifier } from './shares/notify.js';
import { RECIPIENT_ROLES, TOKEN_PATTERN, hashToken, newToken, shareStoreFromEnv, type Recipient, type RecipientRole, type ShareStore } from './shares/store.js';
import { runMapping } from './mapping/pipeline.js';
import type { MappingEngine } from './mapping/types.js';
import { parseStoryDraft } from './storyDraft.js';
import type { TranscriptSource } from '../src/lib/transcript/types.js';

/** Largest JSON body accepted. The transcript rules (200,000 characters) are stricter; this is the outer limit. */
export const MAX_BODY = '1mb';

/** Longest a doctor link can last (the app offers 1, 7 or 30 days). */
export const MAX_SHARE_DAYS = 30;

/** e.g. "appointment-ready-api", from the product name in src/lib/brand.ts. */
const SERVICE_NAME = `${APP_NAME.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-api`;

const SOURCES: readonly TranscriptSource[] = ['paste', 'upload', 'sample'];

/**
 * Returned instead of a payload when crisis language is found: the same gentle handoff as the app's
 * /help/now screen, with 988 surfaced first (team rule), then the warmline directory and 911.
 */
export const CRISIS_HELP = {
  message: crisisMessageText(),
  resources: CRISIS_DETECTED_RESOURCES,
} as const;

export type ApiErrorCode =
  | 'EMPTY'
  | 'TOO_LONG'
  | 'INVALID_INPUT'
  | 'INVALID_STORY'
  | 'EMPTY_STORY'
  | 'INVALID_TEXT'
  | 'EMPTY_TEXT'
  | 'TEXT_TOO_LONG'
  | 'INVALID_RESULTS'
  | 'INVALID_SHARE'
  | 'EMPTY_BRIEF'
  | 'SHARE_NOT_FOUND'
  | 'LINK_NOT_FOUND'
  | 'LINK_EXPIRED'
  | 'LINK_STOPPED'
  | 'SHARING_NOT_CONFIGURED'
  | 'DEMO_NOT_SET_UP'
  | 'NO_APP_DATA'
  | 'DEMO_ACCOUNT_READ_ONLY'
  | 'EMPTY_RESULTS'
  | 'MALFORMED_JSON'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'METHOD_NOT_ALLOWED'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'AUTH_NOT_CONFIGURED'
  | 'INTERNAL';

const MESSAGES: Record<Exclude<ApiErrorCode, 'EMPTY' | 'TOO_LONG'>, string> = {
  INVALID_INPUT: 'Send a JSON object like { "transcript": "...", "source": "paste" }.',
  INVALID_STORY: 'Send a JSON object like { "draft": { "opening": "..." } } using the app’s answer choices.',
  EMPTY_STORY: 'Tell us a little about what’s been happening first.',
  INVALID_TEXT: 'Send a JSON object like { "text": "..." }.',
  EMPTY_TEXT: 'Paste the words you’d like explained first.',
  INVALID_SHARE: `Send { "brief": {...}, "recipient": { "name", "role", "email", "clinic" }, "days": 1–${MAX_SHARE_DAYS} }. Role is one of: ${RECIPIENT_ROLES.join(', ')}.`,
  EMPTY_BRIEF: 'Add at least one priority or symptom to your brief before sharing it.',
  SHARE_NOT_FOUND: 'We couldn’t find that shared link in your account.',
  LINK_NOT_FOUND: 'We can’t find this link. Check that the whole link was copied.',
  LINK_EXPIRED: 'This link has expired. Ask the patient for a new one.',
  LINK_STOPPED: 'The patient stopped sharing this link. Ask them for a new one.',
  NO_APP_DATA: 'There’s no saved app data for this account on the server yet.',
  DEMO_ACCOUNT_READ_ONLY: 'This is the shared demo account (Theo), so this can’t be done here. Sign up to use it with your own information.',
  DEMO_NOT_SET_UP: 'The demo patient isn’t set up on the server yet.',
  SHARING_NOT_CONFIGURED: 'Sharing with your doctor isn’t set up on the server yet.',
  INVALID_RESULTS: `Send a JSON object like { "labs": [{ "test": "...", "value": "...", "typicalRange": "..." }], "note": "..." } (up to ${MAX_LAB_ROWS} results).`,
  EMPTY_RESULTS: 'Add a lab result or a clinical note to explain first.',
  TEXT_TOO_LONG: `That’s more than we can explain at once (limit ${MAX_EXPLAIN_CHARS.toLocaleString('en-US')} characters).`,
  MALFORMED_JSON: 'The request body is not valid JSON.',
  PAYLOAD_TOO_LARGE: `The request body is too large (limit ${MAX_BODY}).`,
  UNSUPPORTED_MEDIA_TYPE: 'Send the request body as JSON (Content-Type: application/json).',
  METHOD_NOT_ALLOWED: 'That method is not allowed on this endpoint.',
  NOT_FOUND: 'No API endpoint at this address.',
  UNAUTHORIZED: 'Please log in to continue.',
  AUTH_NOT_CONFIGURED: 'Sign-in isn’t set up on the server yet.',
  INTERNAL: 'Something went wrong on our side. Please try again.',
};

function sendError(res: Response, status: number, code: keyof typeof MESSAGES) {
  res.status(status).json({ status: 'error', error: { code, message: MESSAGES[code] } });
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** A care-team member from a request. Email lowercased; unknown fields dropped. undefined = invalid. */
function parseRecipient(input: unknown): Recipient | undefined {
  if (!isPlainObject(input)) return undefined;
  const { name, role, email, clinic = '' } = input;
  if (typeof name !== 'string' || !name.trim() || name.length > 100) return undefined;
  if (typeof role !== 'string' || !RECIPIENT_ROLES.includes(role as RecipientRole)) return undefined;
  if (typeof email !== 'string' || email.length > 254 || !EMAIL.test(email.trim())) return undefined;
  if (typeof clinic !== 'string' || clinic.length > 150) return undefined;
  return { name: name.trim(), role: role as RecipientRole, email: email.trim().toLowerCase(), clinic: clinic.trim() };
}

/** Lab rows from a request: known fields only, strings within limits. undefined = invalid. Missing = no rows. */
function parseLabRows(input: unknown): LabRow[] | undefined {
  if (input === undefined) return [];
  if (!Array.isArray(input) || input.length > MAX_LAB_ROWS) return undefined;
  const rows: LabRow[] = [];
  for (const item of input) {
    if (!isPlainObject(item)) return undefined;
    const { test, value, typicalRange } = item;
    const ok = (v: unknown) => typeof v === 'string' && v.trim().length > 0 && v.length <= MAX_LAB_FIELD_CHARS;
    if (!ok(test) || !ok(value)) return undefined;
    if (typicalRange !== undefined && (typeof typicalRange !== 'string' || typicalRange.length > MAX_LAB_FIELD_CHARS)) return undefined;
    rows.push({ test: test as string, value: value as string, ...(typicalRange ? { typicalRange } : {}) });
  }
  return rows;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * @param auth     Sign-in settings. Defaults to the environment (see server/auth.ts); tests pass their own.
 * @param demo     The public Theo demo record (server/demo/source.ts). Defaults to Supabase when the server key is set.
 * @param notifier Sends the instant "stopped" signal to open doctor pages (server/shares/notify.ts).
 * @param shares   Where doctor links are stored (server/shares/store.ts). Defaults to Supabase when the server key is set.
 * @param mapping  Plain → clinical engine. Defaults to the environment (server/mapping/config.ts): the free
 *                 rules engine unless MAPPING_ENGINE=claude and ANTHROPIC_API_KEY are both set.
 */
export function createApp({
  auth = authConfigFromEnv(),
  mapping = mappingEngineFromEnv().engine,
  shares = shareStoreFromEnv(),
  notifier = shareNotifierFromEnv(),
  demo = demoSourceFromEnv(),
  today = () => new Date().toISOString().slice(0, 10),
}: {
  auth?: AuthConfig;
  mapping?: MappingEngine;
  shares?: ShareStore;
  notifier?: ShareNotifier;
  demo?: DemoSource;
  /** Today as YYYY-MM-DD (tests pass a fixed day). */
  today?: () => string;
} = {}) {
  const signedIn = requireUser(auth, sendError);
  const app = express();
  app.disable('x-powered-by');

  // Baseline security headers on every response.
  app.use((_req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store', // responses can contain transcript text: never cache them
      'Referrer-Policy': 'no-referrer',
    });
    next();
  });

  const api = express.Router();
  // Parses only application/json bodies; anything else leaves req.body undefined.
  api.use(express.json({ limit: MAX_BODY, strict: true }));

  /** GET /api/health: is the server up? Used by people and uptime monitors. */
  api.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: SERVICE_NAME, mappingEngine: mapping.name, time: new Date().toISOString() });
  });

  /**
   * POST /api/transcripts: run a visit transcript through intake.
   * Body: { "transcript": string, "source"?: "paste" | "upload" | "sample" }
   * 201 accepted (payload) · 200 crisis (help, no payload) · 400 rejected · 415 not JSON
   * Nothing is stored: the server checks and shapes the transcript, then forgets it.
   */
  api.post('/transcripts', signedIn, (req, res) => {
    if (!req.is('application/json')) return sendError(res, 415, 'UNSUPPORTED_MEDIA_TYPE');
    const body: unknown = req.body;
    if (!isPlainObject(body)) return sendError(res, 400, 'INVALID_INPUT');

    const source = body.source ?? 'paste';
    if (typeof source !== 'string' || !SOURCES.includes(source as TranscriptSource)) {
      return sendError(res, 400, 'INVALID_INPUT');
    }

    const outcome = processTranscript(body.transcript, source as TranscriptSource);
    switch (outcome.status) {
      case 'crisis':
        return res.status(200).json({ status: 'crisis', help: CRISIS_HELP });
      case 'rejected':
        return res.status(400).json({ status: 'error', error: outcome.error });
      case 'accepted':
        return res.status(201).json({ status: 'accepted', payload: outcome.payload });
    }
  });

  /**
   * POST /api/prep-summary: "See it in doctor terms". Runs the engine with the guardrails on the server.
   * Body: { "draft": StoryDraft }  (only known fields are read; chip answers must be the app's own choices)
   * 200 { status: "ok", fields, disclaimer, engine } · 200 { status: "crisis", help } (engine never runs)
   * 200 { status: "blocked", message, rules } (a guardrail was broken; nothing to show or save)
   * 400 invalid or empty story · 415 not JSON. Nothing is stored and the story is never logged.
   */
  api.post('/prep-summary', signedIn, async (req, res) => {
    if (!req.is('application/json')) return sendError(res, 415, 'UNSUPPORTED_MEDIA_TYPE');
    const body: unknown = req.body;
    if (!isPlainObject(body)) return sendError(res, 400, 'INVALID_STORY');
    const parsed = parseStoryDraft(body.draft);
    if (!parsed.ok) return sendError(res, 400, 'INVALID_STORY');

    // Rules engine by default; the optional AI engine falls back to it on any problem (ADR-006).
    const outcome = await runMapping(parsed.draft, mapping);
    switch (outcome.status) {
      case 'crisis':
        return res.status(200).json({ status: 'crisis', help: CRISIS_HELP });
      case 'blocked':
        // Rule ids only: the blocked text itself never leaves the server.
        return res.status(200).json({ status: 'blocked', message: outcome.message, rules: [...new Set(outcome.violations.map((v) => v.rule))] });
      case 'ok': {
        const empty = outcome.fields.every((f) => f.clinical === 'Not discussed') && !parsed.draft.opening.trim();
        if (empty) return sendError(res, 400, 'EMPTY_STORY');
        return res.status(200).json({ status: 'ok', fields: outcome.fields, disclaimer: DISCLAIMERS.short.body, engine: outcome.engine });
      }
    }
  });

  /**
   * POST /api/visit-summary: transcript → "What the doctor said" for the Recap (recap.doctorSaid).
   * Body: { "transcript": string, "source"?: "paste" | "upload" | "sample", "patientName"?: string }
   * 200 { status: "ok", doctorSaid: string[], clinicians: string[], dialogueTurns, disclaimer }
   * 200 { status: "crisis", help } (nothing built) · 400 rejected (empty, too long, bad input) · 415 not JSON
   * Rule-based for now (the clinician's own lines). Nothing is stored and the transcript is never logged.
   */
  api.post('/visit-summary', signedIn, (req, res) => {
    if (!req.is('application/json')) return sendError(res, 415, 'UNSUPPORTED_MEDIA_TYPE');
    const body: unknown = req.body;
    if (!isPlainObject(body)) return sendError(res, 400, 'INVALID_INPUT');
    const source = body.source ?? 'paste';
    if (typeof source !== 'string' || !SOURCES.includes(source as TranscriptSource)) return sendError(res, 400, 'INVALID_INPUT');
    const patientName = body.patientName;
    if (patientName !== undefined && (typeof patientName !== 'string' || patientName.length > 80)) return sendError(res, 400, 'INVALID_INPUT');
    // Optional: the visit's talking points, so the summary can say which ones came up (up to 3, as in the app).
    const talkingPoints = body.talkingPoints ?? [];
    if (!Array.isArray(talkingPoints) || talkingPoints.length > 3 || !talkingPoints.every((p) => typeof p === 'string' && p.length <= 300)) {
      return sendError(res, 400, 'INVALID_INPUT');
    }

    const outcome = processTranscript(body.transcript, source as TranscriptSource);
    if (outcome.status === 'crisis') return res.status(200).json({ status: 'crisis', help: CRISIS_HELP });
    if (outcome.status === 'rejected') return res.status(400).json({ status: 'error', error: outcome.error });
    const { payload } = outcome;
    // Plain-language after-visit summary (ADR-011). Crisis in the talking points still routes to help.
    const after = summarizeVisit(payload, { patientName, talkingPoints });
    if (after.status === 'crisis') return res.status(200).json({ status: 'crisis', help: CRISIS_HELP });
    return res.status(200).json({
      status: 'ok',
      summary: after.status === 'ok' ? after.summary : null,
      // Action items (ADR-013), dated from today: the visit just happened.
      actionItems: after.status === 'ok' ? extractActionItems(after.summary, { visitDate: new Date().toISOString().slice(0, 10), clinician: clinicianSpeakers(payload, patientName)[0] }) : [],
      doctorSaid: doctorSaidFrom(payload, patientName),
      clinicians: clinicianSpeakers(payload, patientName),
      dialogueTurns: payload.stats.dialogueTurns,
      disclaimer: SYNTHETIC_LABEL,
    });
  });

  /**
   * POST /api/notes-summary: the plain-language after-visit summary for a REAL user's visit (ADR-011, ADR-013).
   * Their source is the visit's quick notes (typed, or spoken through the At-the-visit live capture). Notes that read
   * like a conversation ("Dr. Lane: …") are summarized as a transcript; anything else as notes. Nothing is stored.
   * Body: { "notes": string, "talkingPoints"?: string[] (up to 3) }
   * 200 { status: "ok", summary } · 200 { status: "crisis", help } · 200 { status: "blocked", message, rules } · 400 · 415
   */
  api.post('/notes-summary', signedIn, (req, res) => {
    if (!req.is('application/json')) return sendError(res, 415, 'UNSUPPORTED_MEDIA_TYPE');
    const body: unknown = req.body;
    if (!isPlainObject(body) || typeof body.notes !== 'string') return sendError(res, 400, 'INVALID_TEXT');
    const notes = body.notes;
    if (!notes.trim()) return sendError(res, 400, 'EMPTY_TEXT');
    if (notes.length > MAX_EXPLAIN_CHARS) return sendError(res, 400, 'TEXT_TOO_LONG');
    const talkingPoints = body.talkingPoints ?? [];
    if (!Array.isArray(talkingPoints) || talkingPoints.length > 3 || !talkingPoints.every((p) => typeof p === 'string' && p.length <= 300)) {
      return sendError(res, 400, 'INVALID_TEXT');
    }
    const asTranscript = processTranscript(notes, 'paste');
    if (asTranscript.status === 'crisis') return res.status(200).json({ status: 'crisis', help: CRISIS_HELP });
    const outcome = asTranscript.status === 'accepted'
      ? summarizeVisit(asTranscript.payload, { talkingPoints })
      : summarizeNotes(notes, { talkingPoints });
    switch (outcome.status) {
      case 'crisis':
        return res.status(200).json({ status: 'crisis', help: CRISIS_HELP });
      case 'blocked':
        return res.status(200).json({ status: 'blocked', message: outcome.message, rules: [...new Set(outcome.violations.map((v) => v.rule))] });
      case 'ok':
        return res.status(200).json({ status: 'ok', summary: outcome.summary, disclaimer: DISCLAIMERS.short.body });
    }
  });

  /**
   * POST /api/explain: clinical → plain. Finds clinical terms and note shorthand ("somnolence", "5/52",
   * "?orthostatic hypotension") and returns the vetted plain explanation for each (ADR-007). Free: no AI.
   * Body: { "text": string }  (a clinical note, what the doctor said, or the app's doctor-terms lines)
   * 200 { status: "ok", explanations: [{ id, term, kind, found, plain }], disclaimer } (empty list: nothing to explain)
   * 200 { status: "crisis", help } · 200 { status: "blocked", message, rules } · 400 · 415. Nothing is stored or logged.
   */
  api.post('/explain', signedIn, (req, res) => {
    if (!req.is('application/json')) return sendError(res, 415, 'UNSUPPORTED_MEDIA_TYPE');
    const body: unknown = req.body;
    if (!isPlainObject(body) || typeof body.text !== 'string') return sendError(res, 400, 'INVALID_TEXT');
    const text = body.text;
    if (!text.trim()) return sendError(res, 400, 'EMPTY_TEXT');
    if (text.length > MAX_EXPLAIN_CHARS) return sendError(res, 400, 'TEXT_TOO_LONG');

    const outcome = explainClinical(text);
    switch (outcome.status) {
      case 'crisis':
        return res.status(200).json({ status: 'crisis', help: CRISIS_HELP });
      case 'blocked':
        return res.status(200).json({ status: 'blocked', message: outcome.message, rules: [...new Set(outcome.violations.map((v) => v.rule))] });
      case 'ok':
        return res.status(200).json({ status: 'ok', explanations: outcome.explanations, disclaimer: DISCLAIMERS.short.body });
    }
  });

  /**
   * POST /api/explain-results: lab results and/or a clinical note in plain language (ADR-008). Free: no AI.
   * Body: { "labs"?: [{ "test", "value", "typicalRange"? }], "note"?: string }  (at least one)
   * 200 { status: "ok", labs: [{ test, value, typicalRange?, position, summary, about? }], note: Explanation[], labsNote, disclaimer }
   * 200 { status: "crisis", help } · 200 { status: "blocked", message, rules } · 400 · 415. Nothing is stored or logged.
   */
  api.post('/explain-results', signedIn, (req, res) => {
    if (!req.is('application/json')) return sendError(res, 415, 'UNSUPPORTED_MEDIA_TYPE');
    const body: unknown = req.body;
    if (!isPlainObject(body)) return sendError(res, 400, 'INVALID_RESULTS');
    const labs = parseLabRows(body.labs);
    if (!labs) return sendError(res, 400, 'INVALID_RESULTS');
    const note = body.note ?? '';
    if (typeof note !== 'string') return sendError(res, 400, 'INVALID_RESULTS');
    if (note.length > MAX_EXPLAIN_CHARS) return sendError(res, 400, 'TEXT_TOO_LONG');
    if (!labs.length && !note.trim()) return sendError(res, 400, 'EMPTY_RESULTS');

    const outcome = explainResults({ labs, note });
    switch (outcome.status) {
      case 'crisis':
        return res.status(200).json({ status: 'crisis', help: CRISIS_HELP });
      case 'blocked':
        return res.status(200).json({ status: 'blocked', message: outcome.message, rules: [...new Set(outcome.violations.map((v) => v.rule))] });
      case 'ok':
        return res.status(200).json({ status: 'ok', labs: outcome.labs, note: outcome.note, labsNote: LABS_NOTE, disclaimer: DISCLAIMERS.short.body });
    }
  });

  /**
   * GET /api/demo: Theo, the synthetic demo patient, for "Explore with demo data" (ADR-010). Public, read-only.
   * Only safe fields leave the server; dates are moved forward so "in 20 days" stays true on any day.
   * 200 { status: "ok", data, label } · 404 DEMO_NOT_SET_UP (the app then uses its built-in Theo)
   */
  api.get('/demo', async (_req, res) => {
    const record = demo ? await demo.get() : null;
    const safe = record ? safeDemoData(record.data) : undefined;
    if (!record || !safe) return sendError(res, 404, 'DEMO_NOT_SET_UP');
    return res.json({ status: 'ok', data: shiftDates(safe, daysBetween(record.anchorDate, today())), label: SYNTHETIC_LABEL });
  });

  /** Theo, the shared demo account: everyone who demos logs in as him, so nothing he does may affect others. */
  const isDemoAccount = (res: Response) => (res.locals.user as AuthUser | undefined)?.role === 'public-demo';

  /**
   * GET /api/me/app-data: the signed-in account's app data on the server (ADR-010). Used when Theo logs in:
   * his record is returned with dates moved to today, like the public demo. 200 { status: "ok", data, isDemoAccount }
   * · 404 NO_APP_DATA (normal for real users until the Visit store sync exists) · 401 · 503
   */
  api.get('/me/app-data', requireUser({ ...auth, required: true }, sendError), async (_req, res) => {
    const user = res.locals.user as AuthUser;
    const record = demo ? await demo.getForUser(user.id) : null;
    const safe = record ? safeDemoData(record.data) : undefined;
    if (!record || !safe) return sendError(res, 404, 'NO_APP_DATA');
    const demoAccount = isDemoAccount(res);
    const data = demoAccount ? shiftDates(safe, daysBetween(record.anchorDate, today())) : safe;
    // Their own email goes back to them only (the public demo never includes it).
    return res.json({ status: 'ok', data: { ...data, profile: { ...(data.profile as object), ...(user.email ? { email: user.email } : {}) } }, isDemoAccount: demoAccount });
  });

  // ---------------------------------------------------------------- sharing with the care team (ADR-009)

  const accountOnly = requireUser({ ...auth, required: true }, sendError);
  const sharing = (_req: Request, res: Response, next: NextFunction) => (shares ? next() : sendError(res, 503, 'SHARING_NOT_CONFIGURED'));
  const userId = (res: Response) => (res.locals.user as { id: string }).id;
  /** Best effort: a failed signal never fails the stop (open pages still re-check on their own). */
  const signalStopped = (hashes: string[]) => notifier.stopped(hashes).catch(() => console.warn('[sharing] stop signal failed'));

  /**
   * POST /api/shares: share the one-page brief with ONE person (one link each).
   * Body: { "brief": BriefSnapshot, "recipient": { "name", "role", "email", "clinic"? }, "days": 1–30 }
   * 201 { status: "ok", share, path: "/shared/<token>", trimmed } (the token is shown only here, once)
   * 200 { status: "crisis", help } (nothing shared) · 400 INVALID_SHARE / EMPTY_BRIEF · 401 · 503
   */
  api.post('/shares', accountOnly, sharing, async (req, res) => {
    if (!req.is('application/json')) return sendError(res, 415, 'UNSUPPORTED_MEDIA_TYPE');
    // Links made as Theo would be visible (with doctors' emails) to everyone who demos as Theo.
    if (isDemoAccount(res)) return sendError(res, 403, 'DEMO_ACCOUNT_READ_ONLY');
    const body: unknown = req.body;
    if (!isPlainObject(body)) return sendError(res, 400, 'INVALID_SHARE');
    const recipient = parseRecipient(body.recipient);
    const days = body.days;
    if (!recipient || typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > MAX_SHARE_DAYS) return sendError(res, 400, 'INVALID_SHARE');
    const built = buildOnePageBrief(body.brief);
    if (!built.ok) {
      if (built.reason === 'crisis') return res.status(200).json({ status: 'crisis', help: CRISIS_HELP });
      return sendError(res, 400, built.reason === 'empty' ? 'EMPTY_BRIEF' : 'INVALID_SHARE');
    }
    const token = newToken();
    const share = await shares!.create(userId(res), recipient, built.brief, hashToken(token), new Date(Date.now() + days * 86_400_000));
    return res.status(201).json({ status: 'ok', share, path: `/shared/${token}`, trimmed: built.trimmed });
  });

  /** GET /api/shares: everyone this patient shares with, one row per link (no tokens). */
  api.get('/shares', accountOnly, sharing, async (_req, res) => {
    res.json({ status: 'ok', shares: await shares!.list(userId(res)) });
  });

  /** DELETE /api/shares/:id: stop sharing with ONE person. Others keep working. 204 · 404 SHARE_NOT_FOUND */
  api.delete('/shares/:id', accountOnly, sharing, async (req, res) => {
    const id = String(req.params.id);
    if (!/^[0-9a-f-]{8,64}$/i.test(id)) return sendError(res, 404, 'SHARE_NOT_FOUND');
    const { found, stoppedHashes } = await shares!.revoke(userId(res), id);
    if (!found) return sendError(res, 404, 'SHARE_NOT_FOUND');
    await signalStopped(stoppedHashes); // open doctor pages clear at once
    return res.status(204).end();
  });

  /** DELETE /api/shares: stop sharing with everyone. 200 { status: "ok", stopped: n } */
  api.delete('/shares', accountOnly, sharing, async (_req, res) => {
    const stopped = await shares!.revokeAll(userId(res));
    await signalStopped(stopped);
    res.json({ status: 'ok', stopped: stopped.length });
  });

  /**
   * GET /api/shared/:token: the doctor's view. Public (the link is the key), read-only, never indexed.
   * 200 { status: "ok", brief, sharedWith: { name, role }, expiresAt } · 404 LINK_NOT_FOUND · 410 LINK_EXPIRED / LINK_STOPPED
   */
  api.get('/shared/:token', sharing, async (req, res) => {
    res.set('X-Robots-Tag', 'noindex, nofollow');
    const token = String(req.params.token);
    if (!TOKEN_PATTERN.test(token)) return sendError(res, 404, 'LINK_NOT_FOUND');
    const found = await shares!.findByTokenHash(hashToken(token));
    if (!found) return sendError(res, 404, 'LINK_NOT_FOUND');
    if (found.revokedAt) return sendError(res, 410, 'LINK_STOPPED');
    if (new Date(found.expiresAt).getTime() <= Date.now()) return sendError(res, 410, 'LINK_EXPIRED');
    return res.json({ status: 'ok', brief: found.brief, sharedWith: found.recipient, expiresAt: found.expiresAt });
  });

  /**
   * DELETE /api/account: permanently deletes the signed-in user's account on the sign-in server. Their database
   * rows go with it (ON DELETE CASCADE). The app then wipes the device. Copy promise: "deleted whenever you ask".
   * 204 deleted · 401 not signed in · 503 sign-in or the admin key isn't configured · 500 the delete failed
   */
  api.delete('/account', requireUser({ ...auth, required: true }, sendError), async (_req, res) => {
    if (!auth.admin) return sendError(res, 503, 'AUTH_NOT_CONFIGURED');
    const user = res.locals.user as { id: string };
    // One visitor must never be able to delete the demo account for everyone.
    if (isDemoAccount(res)) return sendError(res, 403, 'DEMO_ACCOUNT_READ_ONLY');
    // Links still open on a doctor's screen are told right after the account (and with it every link) is gone.
    const openLinks = shares ? await shares.activeHashes(user.id).catch(() => []) : [];
    const ok = await auth.admin.deleteUser(user.id);
    if (!ok) return sendError(res, 500, 'INTERNAL');
    await signalStopped(openLinks);
    return res.status(204).end();
  });

  api.all(['/health', '/demo', '/me/app-data', '/transcripts', '/prep-summary', '/visit-summary', '/explain', '/explain-results', '/notes-summary', '/shares', '/shares/:id', '/shared/:token', '/account'], (_req, res) => sendError(res, 405, 'METHOD_NOT_ALLOWED'));
  api.use((_req, res) => sendError(res, 404, 'NOT_FOUND'));

  app.use('/api', api);
  app.use((_req, res) => sendError(res, 404, 'NOT_FOUND'));

  // Last stop for any error. Logs only the error's type, never the request body or message.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const type = isPlainObject(err) && typeof err.type === 'string' ? err.type : undefined;
    if (type === 'entity.parse.failed') return sendError(res, 400, 'MALFORMED_JSON');
    if (type === 'entity.too.large') return sendError(res, 413, 'PAYLOAD_TOO_LARGE');
    console.error('[api] unexpected error:', err instanceof Error ? err.name : typeof err);
    return sendError(res, 500, 'INTERNAL');
  });

  return app;
}
