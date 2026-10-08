import { randomUUID } from 'node:crypto';
import express, { type Application, type Request, type RequestHandler, type Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { rolesFor } from './access.js';
import {
  type EndUserSession,
  readCookie,
  SESSION_COOKIE_NAME,
  STATE_COOKIE_NAME,
  STATE_TTL_SECONDS,
  sessionCookieOptions,
  signSession,
  signState,
  verifySession,
  verifyState,
} from './endUserSession.js';
import {
  type CitadelOAuthClient,
  type CitadelProfile,
  createCitadelOAuthClient,
  OAuthError,
} from './oauth.js';
import { type TokenStore, tokenStore } from './tokenStore.js';

// Attaches the verified session to the request for downstream handlers. The Express namespace is
// how @types/express expects Request to be augmented.
declare global {
  namespace Express {
    interface Request {
      noonUser?: EndUserSession;
    }
  }
}

const DEFAULT_REFRESH_SKEW_SECONDS = 60;

// Login-failure codes the callback redirects to /login with. LoginScreen owns the user-facing
// copy; only these fixed codes ever appear in the query string (nothing user-controlled).
export type LoginErrorCode = 'not_staff' | 'state' | 'failed';

// App-side defense-in-depth on top of Citadel's own staff filter (which is by userType, not
// domain — see filterStaffPortalProfiles in noon-citadel). Per INTEGRATE.md §5.5. `non.sa` is a
// real Noon domain, not a typo.
const STAFF_EMAIL_DOMAINS = ['noonacademy.com', 'noon.edu.sa', 'non.sa'];

export function isStaffEmail(email: string): boolean {
  const lower = email.toLowerCase();
  return STAFF_EMAIL_DOMAINS.some((domain) => lower.endsWith(`@${domain}`));
}

export interface EndUserAuthDeps {
  oauth: CitadelOAuthClient;
  tokenStore: TokenStore;
  sessionSecret: string;
  // Set the cookie's Secure flag (true only over HTTPS / in a deployment).
  secure: boolean;
  // Refresh the Citadel token this many seconds before it actually expires.
  refreshSkewSeconds?: number;
}

// Identity for the cookie, from the token exchange's single profile object — Citadel resolves the
// staff profile server-side, so there's no profile picking left to do here. Null (no usable email)
// is treated as not-staff by the callback.
function deriveIdentity(profile: CitadelProfile | null): {
  email: string;
  name: string;
  coreProfileId: number | null;
} | null {
  const email = profile?.email ?? profile?.account?.email;
  if (!profile || !email) {
    return null;
  }
  return {
    email,
    name: profile.name ?? email,
    coreProfileId: profile.id ?? null,
  };
}

export type RefreshOutcome = 'valid' | 'refreshed' | 'expired' | 'error';

// Citadel refresh tokens are single-use, so two concurrent refreshes for the same session are not
// just wasteful — the loser's 401 would wrongly kill the session. Concurrent callers share one
// in-flight refresh per (store, session) instead. Keyed weakly by store so test stores don't leak.
const inflightRefreshes = new WeakMap<TokenStore, Map<string, Promise<RefreshOutcome>>>();

// Rotates the stored Citadel token pair when it's within the skew window of expiry. Returns:
//   'valid'     — still fresh, no call made
//   'refreshed' — rotated successfully, tokenStore updated
//   'expired'   — Citadel rejected the refresh token (401); tokenStore entry cleared, re-auth needed
//   'error'     — transient failure; the pair is left untouched
export function attemptRefresh(
  deps: Pick<EndUserAuthDeps, 'oauth' | 'tokenStore' | 'refreshSkewSeconds'>,
  sessionId: string,
): Promise<RefreshOutcome> {
  let perStore = inflightRefreshes.get(deps.tokenStore);
  if (!perStore) {
    perStore = new Map();
    inflightRefreshes.set(deps.tokenStore, perStore);
  }
  const inflight = perStore.get(sessionId);
  if (inflight) {
    return inflight;
  }
  const run = doAttemptRefresh(deps, sessionId).finally(() => perStore.delete(sessionId));
  perStore.set(sessionId, run);
  return run;
}

async function doAttemptRefresh(
  deps: Pick<EndUserAuthDeps, 'oauth' | 'tokenStore' | 'refreshSkewSeconds'>,
  sessionId: string,
): Promise<RefreshOutcome> {
  const stored = deps.tokenStore.get(sessionId);
  if (!stored) {
    // No stored token means the session is no longer active (logged out, or dropped on restart).
    return 'expired';
  }
  const skewMs = (deps.refreshSkewSeconds ?? DEFAULT_REFRESH_SKEW_SECONDS) * 1000;
  const expiresAtMs = stored.obtainedAt + stored.expiresIn * 1000;
  if (Date.now() < expiresAtMs - skewMs) {
    return 'valid';
  }
  try {
    const next = await deps.oauth.refresh({ refreshToken: stored.refreshToken });
    deps.tokenStore.set(sessionId, {
      accessToken: next.accessToken,
      refreshToken: next.refreshToken,
      expiresIn: next.expiresIn,
      obtainedAt: Date.now(),
    });
    return 'refreshed';
  } catch (err) {
    if (err instanceof OAuthError && err.status === 401) {
      deps.tokenStore.delete(sessionId);
      return 'expired';
    }
    return 'error';
  }
}

function clearSessionCookie(res: express.Response, secure: boolean): void {
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/', httpOnly: true, secure, sameSite: 'lax' });
}

function sessionFromRequest(req: Request, secret: string): EndUserSession | null {
  return verifySession(secret, readCookie(req.headers.cookie, SESSION_COOKIE_NAME));
}

// A session only counts as active while its Citadel tokens are still in the store. Logout deletes
// them, and the in-memory store is empty after a restart — so a signed cookie alone no longer
// authorises, which closes the logout / restart replay window.
function activeSessionFromRequest(
  req: Request,
  deps: Pick<EndUserAuthDeps, 'sessionSecret' | 'tokenStore'>,
): EndUserSession | null {
  const session = sessionFromRequest(req, deps.sessionSecret);
  if (!session || !deps.tokenStore.get(session.sessionId)) {
    return null;
  }
  return session;
}

export function createAuthRouter(deps: EndUserAuthDeps): Router {
  const router = express.Router();

  // Rate-limit the sign-in routes. The OAuth callback runs an expensive Citadel token exchange,
  // so cap attempts to blunt brute-force / DoS (clears CodeQL js/missing-rate-limiting).
  const signInLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: true,
    legacyHeaders: false,
    // Behind Replit's single proxy there's no distinct client IP, so skip the X-Forwarded-For
    // check and treat this as a coarse cap rather than erroring at runtime.
    validate: { xForwardedForHeader: false },
  });

  // The login screen is part of the SPA. If the visitor is already signed in there's nothing to
  // show, so bounce to the app; otherwise fall through to the SPA catch-all (the gate allowlists
  // /login so this doesn't loop).
  router.get('/login', (req, res, next) => {
    if (activeSessionFromRequest(req, deps)) {
      res.redirect(302, '/');
      return;
    }
    next();
  });

  // Starts the authorization-code flow: mint a CSRF state nonce, park it in a short-lived signed
  // cookie, and send the browser to Citadel's authorize page. Plain navigation — no XHR, no script.
  router.get('/auth/login', signInLimiter, (_req, res) => {
    const state = randomUUID();
    res.cookie(STATE_COOKIE_NAME, signState(deps.sessionSecret, state), {
      httpOnly: true,
      secure: deps.secure,
      sameSite: 'lax',
      path: '/',
      maxAge: STATE_TTL_SECONDS * 1000,
    });
    res.redirect(302, deps.oauth.authorizeUrl({ state }));
  });

  // Session probe used by the app shell. Also the one place a proactive token refresh is triggered
  // in v1 (no per-user read consumes the token yet).
  router.get('/api/me', async (req, res) => {
    const session = activeSessionFromRequest(req, deps);
    if (!session) {
      res.status(401).json({ error: 'Not signed in' });
      return;
    }
    const outcome = await attemptRefresh(deps, session.sessionId);
    if (outcome === 'expired') {
      clearSessionCookie(res, deps.secure);
      res.status(401).json({ error: 'Session expired' });
      return;
    }
    // Roles ride along so the app shell can hide links the viewer can't use. Presentation only —
    // every actual data load is re-checked server-side in /api/views/:name (see server/access.ts).
    res.json({ email: session.email, name: session.name, roles: rolesFor(session.email) });
  });

  // Citadel sends the browser back here with ?code=&state=. This is a top-level GET navigation,
  // so every outcome is a redirect: success lands on the app, failure lands on /login with a fixed
  // error code the login screen turns into copy. The code is exchanged server-to-server (HMAC),
  // tokens go in the tokenStore, and the identity cookie carries no Citadel token — same split as
  // before the migration.
  router.get('/oauth/callback', signInLimiter, async (req, res) => {
    const fail = (code: LoginErrorCode): void => {
      res.redirect(302, `/login?error=${code}`);
    };
    // The state cookie is single-shot: consumed (and cleared) whether or not the login succeeds.
    const expectedState = verifyState(
      deps.sessionSecret,
      readCookie(req.headers.cookie, STATE_COOKIE_NAME),
    );
    res.clearCookie(STATE_COOKIE_NAME, {
      path: '/',
      httpOnly: true,
      secure: deps.secure,
      sameSite: 'lax',
    });

    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    if (!expectedState || !state || state !== expectedState) {
      fail('state');
      return;
    }
    if (!code || typeof req.query.error === 'string') {
      fail('failed');
      return;
    }

    let tokenResult: Awaited<ReturnType<CitadelOAuthClient['token']>>;
    try {
      tokenResult = await deps.oauth.token({ code });
    } catch (err) {
      // Citadel 403s the exchange for non-staff accounts; everything else is a generic failure.
      fail(err instanceof OAuthError && err.status === 403 ? 'not_staff' : 'failed');
      return;
    }

    const identity = deriveIdentity(tokenResult.profile);
    if (!identity || !isStaffEmail(identity.email)) {
      fail('not_staff');
      return;
    }

    const sessionId = randomUUID();
    deps.tokenStore.set(sessionId, {
      accessToken: tokenResult.token.accessToken,
      refreshToken: tokenResult.token.refreshToken,
      expiresIn: tokenResult.token.expiresIn,
      obtainedAt: Date.now(),
    });
    const token = signSession(deps.sessionSecret, { sessionId, ...identity });
    res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions(deps.secure));
    res.redirect(302, '/');
  });

  router.post('/logout', signInLimiter, (req, res) => {
    const session = sessionFromRequest(req, deps.sessionSecret);
    if (session) {
      deps.tokenStore.delete(session.sessionId);
    }
    clearSessionCookie(res, deps.secure);
    res.status(204).end();
  });

  return router;
}

const STATIC_ASSET =
  /\.(?:js|mjs|css|map|svg|png|jpe?g|gif|ico|webp|woff2?|ttf|eot|json|txt|wasm)$/i;

// Requests that must reach through the gate unauthenticated so the login screen can load and sign in.
function isAllowlisted(req: Request): boolean {
  if (req.method === 'GET' && req.path === '/login') {
    return true;
  }
  if (req.path === '/health') {
    return true;
  }
  // The SPA bundle (login + app share one build) and other static assets. Exclude API paths so a
  // future protected route ending in .json/.txt/.map can't slip through the gate unauthenticated.
  if (
    req.method === 'GET' &&
    !req.path.startsWith('/api/') &&
    !req.path.startsWith('/__synapse/') &&
    STATIC_ASSET.test(req.path)
  ) {
    return true;
  }
  return false;
}

// The gate. A valid cookie attaches req.noonUser and continues; otherwise a page navigation is
// redirected to /login and an API/XHR call gets a 401 JSON. Auth-router paths (/auth/login,
// /oauth/callback, /logout, /api/me) are handled before this runs, so they never reach it.
export function createRequireEndUser(
  deps: Pick<EndUserAuthDeps, 'sessionSecret' | 'tokenStore'>,
): RequestHandler {
  return (req, res, next) => {
    if (isAllowlisted(req)) {
      next();
      return;
    }
    const session = activeSessionFromRequest(req, deps);
    if (session) {
      req.noonUser = session;
      next();
      return;
    }
    if (req.path.startsWith('/api/') || req.method !== 'GET') {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    res.redirect(302, '/login');
  };
}

// Mounts the whole end-user auth surface on the app: the auth router first (so its routes are
// handled unauthenticated), then the gate (which guards everything registered after this call —
// /api/views and the SPA catch-all).
export function installEndUserAuth(app: Application, deps: EndUserAuthDeps): void {
  app.use(createAuthRouter(deps));
  app.use(createRequireEndUser(deps));
}

export interface EndUserAuthConfig {
  baseUrl: string;
  appId: string | null;
  appSecret: string | null;
  redirectUri: string | null;
  sessionSecret: string | null;
  secure: boolean;
}

// Builds the deps from resolved config, using the process-wide tokenStore. Returns null when any
// required secret is missing so the caller can leave auth unmounted and surface the config error
// (matching synapse.ts's "surface, don't throw" pattern).
export function buildEndUserAuthDeps(config: EndUserAuthConfig): EndUserAuthDeps | null {
  if (!config.appId || !config.appSecret || !config.redirectUri || !config.sessionSecret) {
    return null;
  }
  return {
    oauth: createCitadelOAuthClient({
      baseUrl: config.baseUrl,
      appId: config.appId,
      appSecret: config.appSecret,
      redirectUri: config.redirectUri,
    }),
    tokenStore,
    sessionSecret: config.sessionSecret,
    secure: config.secure,
  };
}
