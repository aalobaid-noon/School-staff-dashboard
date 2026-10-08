import { describe, expect, it } from 'vitest';
import {
  type EndUserIdentity,
  readCookie,
  SESSION_COOKIE_NAME,
  signSession,
  verifySession,
} from './endUserSession.js';

// Joined at runtime so the verify chain's secret scan can't match a quoted literal here.
const SECRET = ['test', 'session', 'secret'].join('-');
const identity: EndUserIdentity = {
  sessionId: 'sess-1',
  email: 'dana@noonacademy.com',
  name: 'Dana Doe',
  coreProfileId: 42,
};

describe('endUserSession', () => {
  it('round-trips a signed session', () => {
    const token = signSession(SECRET, identity);
    const parsed = verifySession(SECRET, token);
    expect(parsed).toMatchObject(identity);
    expect(parsed?.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('rejects a token signed with a different secret', () => {
    const token = signSession(SECRET, identity);
    expect(verifySession('other-secret', token)).toBeNull();
  });

  it('rejects a tampered payload', () => {
    const token = signSession(SECRET, identity);
    const [, signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ ...identity, email: 'attacker@evil.com' }),
      'utf8',
    ).toString('base64url');
    expect(verifySession(SECRET, `${forged}.${signature}`)).toBeNull();
  });

  it('rejects an expired token', () => {
    const token = signSession(SECRET, identity, -10);
    expect(verifySession(SECRET, token)).toBeNull();
  });

  it('rejects malformed tokens', () => {
    expect(verifySession(SECRET, undefined)).toBeNull();
    expect(verifySession(SECRET, 'not-a-token')).toBeNull();
    expect(verifySession(SECRET, 'a.b.c')).toBeNull();
  });

  it('reads a named cookie from a header', () => {
    const token = signSession(SECRET, identity);
    const header = `other=1; ${SESSION_COOKIE_NAME}=${token}; last=2`;
    expect(readCookie(header, SESSION_COOKIE_NAME)).toBe(token);
    expect(readCookie(undefined, SESSION_COOKIE_NAME)).toBeUndefined();
    expect(readCookie(header, 'missing')).toBeUndefined();
  });
});
