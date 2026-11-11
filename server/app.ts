/**
 * Get Heard API: the Express app.
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
import { CRISIS_DETECTED_RESOURCES, crisisMessageText } from '../src/lib/guardrails/copy.js';
import { processTranscript } from '../src/lib/transcript/intake.js';
import type { TranscriptSource } from '../src/lib/transcript/types.js';

/** Largest JSON body accepted. The transcript rules (200,000 characters) are stricter; this is the outer limit. */
export const MAX_BODY = '1mb';

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
  | 'MALFORMED_JSON'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'METHOD_NOT_ALLOWED'
  | 'NOT_FOUND'
  | 'INTERNAL';

const MESSAGES: Record<Exclude<ApiErrorCode, 'EMPTY' | 'TOO_LONG'>, string> = {
  INVALID_INPUT: 'Send a JSON object like { "transcript": "...", "source": "paste" }.',
  MALFORMED_JSON: 'The request body is not valid JSON.',
  PAYLOAD_TOO_LARGE: `The request body is too large (limit ${MAX_BODY}).`,
  UNSUPPORTED_MEDIA_TYPE: 'Send the request body as JSON (Content-Type: application/json).',
  METHOD_NOT_ALLOWED: 'That method is not allowed on this endpoint.',
  NOT_FOUND: 'No API endpoint at this address.',
  INTERNAL: 'Something went wrong on our side. Please try again.',
};

function sendError(res: Response, status: number, code: keyof typeof MESSAGES) {
  res.status(status).json({ status: 'error', error: { code, message: MESSAGES[code] } });
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function createApp() {
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
    res.json({ status: 'ok', service: 'get-heard-api', time: new Date().toISOString() });
  });

  /**
   * POST /api/transcripts: run a visit transcript through intake.
   * Body: { "transcript": string, "source"?: "paste" | "upload" | "sample" }
   * 201 accepted (payload) · 200 crisis (help, no payload) · 400 rejected · 415 not JSON
   * Nothing is stored: the server checks and shapes the transcript, then forgets it.
   */
  api.post('/transcripts', (req, res) => {
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

  api.all(['/health', '/transcripts'], (_req, res) => sendError(res, 405, 'METHOD_NOT_ALLOWED'));
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
