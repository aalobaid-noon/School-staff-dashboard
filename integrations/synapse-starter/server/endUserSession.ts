import { createHmac, timingSafeEqual } from 'node:crypto';

// The app's own end-user session cookie. Copies the shape of Citadel's
// src/middleware/webSession.ts: base64url(JSON payload) + "." + HMAC-SHA256(payload) verified with
// a constant-time compare. The cookie carries ONLY identity — never the Citadel access/refresh
// tokens (those live server-side in the tokenStore, keyed by sessionId).

export interface EndUserIdentity {
  sessionId: string;
  email: string;
  name: string;
  // noon2_core profile id resolved at login. Null when the login payload carried no numeric id.
  coreProfileId: number | null;
}

export interface EndUserSession extends EndUserIdentity {
  // Unix seconds. Beyond this the cookie is rejected regardless of the browser's own expiry.
  exp: number;
}

export const SESSION_COOKIE_NAME = 'synapse_enduser_session';

// Identity horizon, matched to Citadel's own web session (one week). The short-lived Citadel access
// token is refreshed behind this via the tokenStore, so the identity cookie can outlive it.
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

const toBase64Url = (input: string): string => Buffer.from(input, 'utf8').toString('base64url');
const fromBase64Url = (input: string): string => Buffer.from(input, 'base64url').toString('utf8');

const sign = (secret: string, value: string): string =>
  createHmac('sha256', secret).update(value).digest('base64url');

const secureEqual = (a: string, b: string): boolean => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  // timingSafeEqual throws on length mismatch, so bail early — the lengths themselves aren't secret.
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
};

const nowSeconds = (): number => Math.floor(Date.now() / 1000);

export function signSession(
  secret: string,
  identity: EndUserIdentity,
  ttlSeconds: number = SESSION_TTL_SECONDS,
): string {
  const payload: EndUserSession = { ...identity, exp: nowSeconds() + ttlSeconds };
  const encoded = toBase64Url(JSON.stringify(payload));
  return `${encoded}.${sign(secret, encoded)}`;
}

export function verifySession(secret: string, token: string | undefined): EndUserSession | null {
  if (!token) {
    return null;
  }
  const parts = token.split('.');
  if (parts.length !== 2) {
    return null;
  }
  const [encoded, signature] = parts;
  if (!encoded || !signature) {
    return null;
  }
  if (!secureEqual(sign(secret, encoded), signature)) {
    return null;
  }
  try {
    const parsed = JSON.parse(fromBase64Url(encoded)) as Partial<EndUserSession>;
    if (
      typeof parsed.sessionId !== 'string' ||
      typeof parsed.email !== 'string' ||
      typeof parsed.name !== 'string' ||
      typeof parsed.exp !== 'number'
    ) {
      return null;
    }
    if (parsed.exp < nowSeconds()) {
      return null;
    }
    return {
      sessionId: parsed.sessionId,
      email: parsed.email,
      name: parsed.name,
      coreProfileId: typeof parsed.coreProfileId === 'number' ? parsed.coreProfileId : null,
      exp: parsed.exp,
    };
  } catch {
    return null;
  }
}

// --- OAuth CSRF state cookie -------------------------------------------------------------------
// The authorization-code flow needs the `state` nonce to survive the round-trip to Citadel before
// any session exists. It rides in its own short-lived HMAC-signed cookie (same signing scheme as
// the session cookie); the callback compares the cookie's state against the query's and clears it.
// sameSite=lax is load-bearing: lax cookies ARE sent on the top-level GET back from Citadel.

export const STATE_COOKIE_NAME = 'synapse_oauth_state';
export const STATE_TTL_SECONDS = 10 * 60;

export function signState(
  secret: string,
  state: string,
  ttlSeconds: number = STATE_TTL_SECONDS,
): string {
  const encoded = toBase64Url(JSON.stringify({ state, exp: nowSeconds() + ttlSeconds }));
  return `${encoded}.${sign(secret, encoded)}`;
}

// Returns the state nonce, or null when the cookie is missing, tampered with, or expired.
export function verifyState(secret: string, token: string | undefined): string | null {
  if (!token) {
    return null;
  }
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature || !secureEqual(sign(secret, encoded), signature)) {
    return null;
  }
  try {
    const parsed = JSON.parse(fromBase64Url(encoded)) as Partial<{ state: string; exp: number }>;
    if (typeof parsed.state !== 'string' || typeof parsed.exp !== 'number') {
      return null;
    }
    return parsed.exp < nowSeconds() ? null : parsed.state;
  } catch {
    return null;
  }
}

export interface SessionCookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: '/';
  maxAge: number;
}

// Options for express `res.cookie` (maxAge in milliseconds). `secure` is true only in a deployed
// (HTTPS) environment; locally it stays false so the cookie survives plain-HTTP dev.
export function sessionCookieOptions(secure: boolean): SessionCookieOptions {
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS * 1000,
  };
}

// Minimal cookie reader — avoids pulling in cookie-parser for the one cookie this app sets.
export function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) {
      continue;
    }
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return undefined;
}
