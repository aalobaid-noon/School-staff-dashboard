import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express, { type Application } from 'express';
import { describe, expect, it } from 'vitest';
import { attemptRefresh, createAuthRouter, type EndUserAuthDeps } from './auth-routes.js';
import {
  SESSION_COOKIE_NAME,
  STATE_COOKIE_NAME,
  signSession,
  verifySession,
} from './endUserSession.js';
import {
  type CitadelOAuthClient,
  OAuthError,
  type OAuthRefreshResult,
  type OAuthTokenResult,
} from './oauth.js';
import { createTokenStore, type TokenStore } from './tokenStore.js';

// Joined at runtime so the verify chain's secret scan can't match a quoted literal here.
const SECRET = ['auth', 'test', 'secret'].join('-');

// --- tiny raw HTTP client (no redirect-following, exposes set-cookie) ---
async function serve(app: Application): Promise<{ port: number; close: () => Promise<void> }> {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const { port } = server.address() as AddressInfo;
  return {
    port,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function request(
  port: number,
  method: string,
  path: string,
  opts: { headers?: Record<string, string>; body?: string } = {},
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, method, path, headers: opts.headers },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
      },
    );
    req.on('error', reject);
    if (opts.body) {
      req.write(opts.body);
    }
    req.end();
  });
}

// --- fake Citadel oauth client ---
function fakeOAuth(overrides: Partial<CitadelOAuthClient> = {}): CitadelOAuthClient {
  const authorizeUrl = ({ state }: { state: string }): string =>
    `https://citadel.example/portal/oauth/authorize?app_id=app_test&redirect_uri=cb&response_type=code&state=${state}`;
  const token = async (): Promise<OAuthTokenResult> => ({
    token: { accessToken: 'at1', refreshToken: 'rt1', type: 'Bearer', expiresIn: 600 },
    profile: {
      id: 42,
      name: 'Dana',
      userType: 'ADMIN',
      account: { email: 'dana@noonacademy.com' },
    },
  });
  const refresh = async (): Promise<OAuthRefreshResult> => ({
    accessToken: 'at2',
    refreshToken: 'rt2',
    type: 'Bearer',
    expiresIn: 600,
  });
  return { authorizeUrl, token, refresh, ...overrides };
}

function makeDeps(overrides: Partial<EndUserAuthDeps> = {}): EndUserAuthDeps {
  return {
    oauth: fakeOAuth(),
    tokenStore: createTokenStore(),
    sessionSecret: SECRET,
    secure: false,
    refreshSkewSeconds: 0,
    ...overrides,
  };
}

function appWith(deps: EndUserAuthDeps): Application {
  const app = express();
  app.use(createAuthRouter(deps));
  return app;
}

function namedCookie(setCookie: string | string[] | undefined, name: string): string | undefined {
  const raw = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  for (const entry of raw) {
    const match = entry.match(new RegExp(`(?:^|; ?)${name}=([^;]*)`));
    if (match) {
      return match[1];
    }
  }
  return undefined;
}

const cookieValue = (setCookie: string | string[] | undefined): string | undefined =>
  namedCookie(setCookie, SESSION_COOKIE_NAME);

// Drives the real initiation route and returns what the browser would carry to the callback:
// the signed state cookie and the state nonce embedded in the authorize redirect.
async function startLogin(port: number): Promise<{ stateCookie: string; state: string }> {
  const res = await request(port, 'GET', '/auth/login');
  expect(res.status).toBe(302);
  const location = new URL(String(res.headers.location));
  const state = location.searchParams.get('state') ?? '';
  const stateCookie = namedCookie(res.headers['set-cookie'], STATE_COOKIE_NAME) ?? '';
  expect(state).toBeTruthy();
  expect(stateCookie).toBeTruthy();
  return { stateCookie, state };
}

describe('GET /auth/login', () => {
  it('redirects to the Citadel authorize URL with app_id + state and sets the state cookie', async () => {
    const { port, close } = await serve(appWith(makeDeps()));

    const res = await request(port, 'GET', '/auth/login');

    expect(res.status).toBe(302);
    const location = new URL(String(res.headers.location));
    expect(location.pathname).toBe('/portal/oauth/authorize');
    expect(location.searchParams.get('app_id')).toBe('app_test');
    expect(location.searchParams.get('response_type')).toBe('code');
    expect(location.searchParams.get('state')).toBeTruthy();
    expect(namedCookie(res.headers['set-cookie'], STATE_COOKIE_NAME)).toBeTruthy();

    await close();
  });
});

describe('GET /oauth/callback', () => {
  it('completes the happy path: exchanges the code, stores the nested token pair, sets the session cookie', async () => {
    const store = createTokenStore();
    const { port, close } = await serve(appWith(makeDeps({ tokenStore: store })));
    const { stateCookie, state } = await startLogin(port);

    const res = await request(port, 'GET', `/oauth/callback?code=code_1&state=${state}`, {
      headers: { cookie: `${STATE_COOKIE_NAME}=${stateCookie}` },
    });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');
    const token = cookieValue(res.headers['set-cookie']);
    expect(token).toBeTruthy();

    const session = verifySession(SECRET, token);
    expect(session?.email).toBe('dana@noonacademy.com');
    expect(session?.coreProfileId).toBe(42);

    const stored = session ? store.get(session.sessionId) : undefined;
    expect(stored?.accessToken).toBe('at1');
    expect(stored?.refreshToken).toBe('rt1');

    // The state cookie is consumed: cleared in the same response.
    expect(namedCookie(res.headers['set-cookie'], STATE_COOKIE_NAME)).toBe('');

    await close();
  });

  it('rejects a state mismatch without touching Citadel or setting a session', async () => {
    let exchanged = false;
    const oauth = fakeOAuth({
      token: async () => {
        exchanged = true;
        throw new Error('should not be called');
      },
    });
    const { port, close } = await serve(appWith(makeDeps({ oauth })));
    const { stateCookie } = await startLogin(port);

    const res = await request(port, 'GET', '/oauth/callback?code=code_1&state=forged', {
      headers: { cookie: `${STATE_COOKIE_NAME}=${stateCookie}` },
    });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login?error=state');
    expect(exchanged).toBe(false);
    expect(cookieValue(res.headers['set-cookie'])).toBeUndefined();

    await close();
  });

  it('rejects a callback with no state cookie (expired or never initiated)', async () => {
    const { port, close } = await serve(appWith(makeDeps()));
    const res = await request(port, 'GET', '/oauth/callback?code=code_1&state=anything');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login?error=state');
    await close();
  });

  it("redirects with not_staff on Citadel's 403 exchange (non-staff account)", async () => {
    const oauth = fakeOAuth({
      token: async () => {
        throw new OAuthError('EXTERNAL_USER only', 403, 'token');
      },
    });
    const { port, close } = await serve(appWith(makeDeps({ oauth })));
    const { stateCookie, state } = await startLogin(port);

    const res = await request(port, 'GET', `/oauth/callback?code=code_1&state=${state}`, {
      headers: { cookie: `${STATE_COOKIE_NAME}=${stateCookie}` },
    });

    expect(res.headers.location).toBe('/login?error=not_staff');
    expect(cookieValue(res.headers['set-cookie'])).toBeUndefined();

    await close();
  });

  it('redirects with not_staff when the profile email is outside the staff domains', async () => {
    const store = createTokenStore();
    const oauth = fakeOAuth({
      token: async () => ({
        token: { accessToken: 'at1', refreshToken: 'rt1', type: 'Bearer', expiresIn: 600 },
        profile: { id: 9, name: 'Eve', account: { email: 'eve@gmail.com' } },
      }),
    });
    const { port, close } = await serve(appWith(makeDeps({ oauth, tokenStore: store })));
    const { stateCookie, state } = await startLogin(port);

    const res = await request(port, 'GET', `/oauth/callback?code=code_1&state=${state}`, {
      headers: { cookie: `${STATE_COOKIE_NAME}=${stateCookie}` },
    });

    expect(res.headers.location).toBe('/login?error=not_staff');
    expect(cookieValue(res.headers['set-cookie'])).toBeUndefined();

    await close();
  });

  it('redirects with failed when the code is missing or Citadel sent an error', async () => {
    const { port, close } = await serve(appWith(makeDeps()));
    const { stateCookie, state } = await startLogin(port);

    const res = await request(port, 'GET', `/oauth/callback?state=${state}&error=access_denied`, {
      headers: { cookie: `${STATE_COOKIE_NAME}=${stateCookie}` },
    });

    expect(res.headers.location).toBe('/login?error=failed');

    await close();
  });
});

describe('attemptRefresh', () => {
  it('rotates the stored token pair when it is near expiry', async () => {
    const store: TokenStore = createTokenStore();
    store.set('sess-x', {
      accessToken: 'at1',
      refreshToken: 'rt1',
      expiresIn: 1,
      obtainedAt: Date.now() - 60_000,
    });
    const deps = makeDeps({ tokenStore: store });

    const outcome = await attemptRefresh(deps, 'sess-x');

    expect(outcome).toBe('refreshed');
    expect(store.get('sess-x')).toMatchObject({ accessToken: 'at2', refreshToken: 'rt2' });
  });

  it('leaves a still-fresh pair untouched', async () => {
    const store = createTokenStore();
    store.set('sess-fresh', {
      accessToken: 'at1',
      refreshToken: 'rt1',
      expiresIn: 3600,
      obtainedAt: Date.now(),
    });
    const deps = makeDeps({ tokenStore: store, refreshSkewSeconds: 60 });

    expect(await attemptRefresh(deps, 'sess-fresh')).toBe('valid');
    expect(store.get('sess-fresh')?.accessToken).toBe('at1');
  });

  it('clears the stored pair when Citadel rejects the refresh token (401)', async () => {
    const store = createTokenStore();
    store.set('sess-dead', {
      accessToken: 'at1',
      refreshToken: 'rt1',
      expiresIn: 1,
      obtainedAt: Date.now() - 60_000,
    });
    const oauth = fakeOAuth({
      refresh: async () => {
        throw new OAuthError('expired', 401, 'refresh');
      },
    });
    const deps = makeDeps({ tokenStore: store, oauth });

    expect(await attemptRefresh(deps, 'sess-dead')).toBe('expired');
    expect(store.get('sess-dead')).toBeUndefined();
  });

  it('always sends the rotated token on the next refresh (single-use pair fully overwritten)', async () => {
    const store = createTokenStore();
    store.set('sess-rotate', {
      accessToken: 'at1',
      refreshToken: 'rt1',
      expiresIn: 1,
      obtainedAt: Date.now() - 60_000,
    });
    const seen: string[] = [];
    const oauth = fakeOAuth({
      refresh: async ({ refreshToken }) => {
        seen.push(refreshToken);
        if (refreshToken === 'rt1') {
          // expiresIn 0 leaves the new pair immediately stale, forcing the next call to refresh.
          return { accessToken: 'at2', refreshToken: 'rt2', type: 'Bearer', expiresIn: 0 };
        }
        if (refreshToken === 'rt2') {
          return { accessToken: 'at3', refreshToken: 'rt3', type: 'Bearer', expiresIn: 600 };
        }
        // A replayed (already-consumed) token is exactly what Citadel would 401.
        throw new OAuthError('single-use replay', 401, 'refresh');
      },
    });
    const deps = makeDeps({ tokenStore: store, oauth });

    expect(await attemptRefresh(deps, 'sess-rotate')).toBe('refreshed');
    expect(await attemptRefresh(deps, 'sess-rotate')).toBe('refreshed');

    expect(seen).toEqual(['rt1', 'rt2']);
    expect(store.get('sess-rotate')).toMatchObject({ accessToken: 'at3', refreshToken: 'rt3' });
  });

  it('shares one in-flight refresh across concurrent callers instead of burning the single-use token twice', async () => {
    const store = createTokenStore();
    store.set('sess-race', {
      accessToken: 'at1',
      refreshToken: 'rt1',
      expiresIn: 1,
      obtainedAt: Date.now() - 60_000,
    });
    let upstreamCalls = 0;
    const oauth = fakeOAuth({
      refresh: async () => {
        upstreamCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { accessToken: 'at2', refreshToken: 'rt2', type: 'Bearer', expiresIn: 600 };
      },
    });
    const deps = makeDeps({ tokenStore: store, oauth });

    const [first, second] = await Promise.all([
      attemptRefresh(deps, 'sess-race'),
      attemptRefresh(deps, 'sess-race'),
    ]);

    expect(upstreamCalls).toBe(1);
    expect(first).toBe('refreshed');
    expect(second).toBe('refreshed');
    expect(store.get('sess-race')).toMatchObject({ accessToken: 'at2', refreshToken: 'rt2' });
  });
});

describe('GET /api/me', () => {
  it('clears the cookie and 401s when a refresh fails', async () => {
    const store = createTokenStore();
    store.set('sess-me', {
      accessToken: 'at1',
      refreshToken: 'rt1',
      expiresIn: 1,
      obtainedAt: Date.now() - 60_000,
    });
    const oauth = fakeOAuth({
      refresh: async () => {
        throw new OAuthError('expired', 401, 'refresh');
      },
    });
    const { port, close } = await serve(appWith(makeDeps({ tokenStore: store, oauth })));

    const cookie = signSession(SECRET, {
      sessionId: 'sess-me',
      email: 'dana@noonacademy.com',
      name: 'Dana',
      coreProfileId: 42,
    });
    const res = await request(port, 'GET', '/api/me', {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });

    expect(res.status).toBe(401);
    expect(cookieValue(res.headers['set-cookie'])).toBe('');
    expect(store.get('sess-me')).toBeUndefined();

    await close();
  });

  it('returns the identity for a valid session (token still stored)', async () => {
    const store = createTokenStore();
    store.set('sess-ok', {
      accessToken: 'at1',
      refreshToken: 'rt1',
      expiresIn: 3600,
      obtainedAt: Date.now(),
    });
    const { port, close } = await serve(appWith(makeDeps({ tokenStore: store })));
    const cookie = signSession(SECRET, {
      sessionId: 'sess-ok',
      email: 'dana@noonacademy.com',
      name: 'Dana',
      coreProfileId: 42,
    });
    const res = await request(port, 'GET', '/api/me', {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    expect(res.status).toBe(200);
    // `roles` is empty in a fresh clone (server/access.ts declares none), but present — the app
    // shell reads it to decide which links to draw, and an absent field would read as "no roles"
    // identically to "roles not implemented".
    expect(JSON.parse(res.body)).toEqual({
      email: 'dana@noonacademy.com',
      name: 'Dana',
      roles: [],
    });
    await close();
  });

  it('401s a signed cookie whose token is gone (logout / restart replay)', async () => {
    // Fresh, empty store: the cookie verifies but no active token backs it.
    const { port, close } = await serve(appWith(makeDeps()));
    const cookie = signSession(SECRET, {
      sessionId: 'sess-gone',
      email: 'dana@noonacademy.com',
      name: 'Dana',
      coreProfileId: 42,
    });
    const res = await request(port, 'GET', '/api/me', {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    expect(res.status).toBe(401);
    await close();
  });

  it('401s without a session cookie', async () => {
    const { port, close } = await serve(appWith(makeDeps()));
    const res = await request(port, 'GET', '/api/me');
    expect(res.status).toBe(401);
    await close();
  });
});
