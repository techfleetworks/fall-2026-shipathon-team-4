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
import { SYNTHETIC_LABEL } from '../src/lib/transcript/constants.js';
import { processTranscript } from '../src/lib/transcript/intake.js';
import { clinicianSpeakers, doctorSaidFrom } from '../src/lib/transcript/recap.js';
import { authConfigFromEnv, requireUser, type AuthConfig } from './auth.js';
import { mappingEngineFromEnv } from './mapping/config.js';
import { runMapping } from './mapping/pipeline.js';
import type { MappingEngine } from './mapping/types.js';
import { parseStoryDraft } from './storyDraft.js';
import type { TranscriptSource } from '../src/lib/transcript/types.js';

/** Largest JSON body accepted. The transcript rules (200,000 characters) are stricter; this is the outer limit. */
export const MAX_BODY = '1mb';

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

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * @param auth     Sign-in settings. Defaults to the environment (see server/auth.ts); tests pass their own.
 * @param mapping  Plain → clinical engine. Defaults to the environment (server/mapping/config.ts): the free
 *                 rules engine unless MAPPING_ENGINE=claude and ANTHROPIC_API_KEY are both set.
 */
export function createApp({
  auth = authConfigFromEnv(),
  mapping = mappingEngineFromEnv().engine,
}: { auth?: AuthConfig; mapping?: MappingEngine } = {}) {
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

    const outcome = processTranscript(body.transcript, source as TranscriptSource);
    if (outcome.status === 'crisis') return res.status(200).json({ status: 'crisis', help: CRISIS_HELP });
    if (outcome.status === 'rejected') return res.status(400).json({ status: 'error', error: outcome.error });
    const { payload } = outcome;
    return res.status(200).json({
      status: 'ok',
      doctorSaid: doctorSaidFrom(payload, patientName),
      clinicians: clinicianSpeakers(payload, patientName),
      dialogueTurns: payload.stats.dialogueTurns,
      disclaimer: SYNTHETIC_LABEL,
    });
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
   * DELETE /api/account: permanently deletes the signed-in user's account on the sign-in server. Their database
   * rows go with it (ON DELETE CASCADE). The app then wipes the device. Copy promise: "deleted whenever you ask".
   * 204 deleted · 401 not signed in · 503 sign-in or the admin key isn't configured · 500 the delete failed
   */
  api.delete('/account', requireUser({ ...auth, required: true }, sendError), async (_req, res) => {
    if (!auth.admin) return sendError(res, 503, 'AUTH_NOT_CONFIGURED');
    const user = res.locals.user as { id: string };
    const ok = await auth.admin.deleteUser(user.id);
    if (!ok) return sendError(res, 500, 'INTERNAL');
    return res.status(204).end();
  });

  api.all(['/health', '/transcripts', '/prep-summary', '/visit-summary', '/explain', '/account'], (_req, res) => sendError(res, 405, 'METHOD_NOT_ALLOWED'));
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
