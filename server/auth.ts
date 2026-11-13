/**
 * Sign-in checks for the Express API (ADR-001: "Express checks the Supabase JWT on every request").
 *
 * Server environment variables (Vercel → Project → Settings → Environment Variables; never in the browser):
 *   SUPABASE_URL               the project URL
 *   SUPABASE_ANON_KEY          public key, used to verify a user's token with Supabase
 *   SUPABASE_SERVICE_ROLE_KEY  SECRET admin key, only for deleting an account. Server only, never VITE_.
 *   REQUIRE_AUTH=true          optional: refuse every protected request if the above are missing (fail closed)
 *
 * When SUPABASE_URL + SUPABASE_ANON_KEY are set, protected routes require a valid "Authorization: Bearer <token>".
 * When they aren't (local dev, CI, the demo before setup), the API stays open, as before.
 */
import { createClient } from '@supabase/supabase-js';
import type { NextFunction, Request, Response } from 'express';

export interface AuthUser {
  id: string;
  email?: string;
  /** From app_metadata (only the server key can set it). 'public-demo' = Theo, the shared demo account (ADR-010). */
  role?: string;
}

/** Returns the user for a valid access token, or null. Must not throw. */
export type TokenVerifier = (token: string) => Promise<AuthUser | null>;

/** Admin actions that need the secret key. */
export interface AccountAdmin {
  deleteUser: (id: string) => Promise<boolean>;
}

export interface AuthConfig {
  verifyToken?: TokenVerifier;
  admin?: AccountAdmin;
  /** True: protected routes need a valid token (503 if no verifier is configured). */
  required: boolean;
}

const MAX_TOKEN_CHARS = 4096;

export function authConfigFromEnv(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const url = env.SUPABASE_URL;
  const anon = env.SUPABASE_ANON_KEY;
  // Trimmed: a stray space pasted before the key would otherwise make every admin call fail.
  const service = env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  const verifyToken: TokenVerifier | undefined =
    url && anon
      ? (() => {
          const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
          return async (token) => {
            try {
              const { data, error } = await client.auth.getUser(token);
              if (error || !data.user) return null;
              const role = data.user.app_metadata?.role;
              return { id: data.user.id, email: data.user.email ?? undefined, ...(typeof role === 'string' ? { role } : {}) };
            } catch {
              return null;
            }
          };
        })()
      : undefined;

  const admin: AccountAdmin | undefined =
    url && service
      ? (() => {
          const client = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
          return {
            deleteUser: async (id) => {
              try {
                const { error } = await client.auth.admin.deleteUser(id);
                return !error;
              } catch {
                return false;
              }
            },
          };
        })()
      : undefined;

  return { verifyToken, admin, required: !!verifyToken || env.REQUIRE_AUTH === 'true' };
}

function bearer(req: Request): string | null {
  const h = req.get('authorization');
  if (!h || h.length > MAX_TOKEN_CHARS + 7) return null;
  const m = /^Bearer ([A-Za-z0-9\-_.]+)$/.exec(h);
  return m ? m[1]! : null;
}

type SendError = (res: Response, status: number, code: 'UNAUTHORIZED' | 'AUTH_NOT_CONFIGURED') => void;

/** Express middleware: lets the request through only with a valid token (when sign-in is required). */
export function requireUser(config: AuthConfig, sendError: SendError) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!config.required) return next();
    if (!config.verifyToken) return sendError(res, 503, 'AUTH_NOT_CONFIGURED');
    const token = bearer(req);
    const user = token ? await config.verifyToken(token) : null;
    if (!user) return sendError(res, 401, 'UNAUTHORIZED');
    res.locals.user = user;
    next();
  };
}
