import { buildHeaders } from '@noonacademy/citadel-transport';

// Thin client for Citadel's OAuth authorization-code flow (INTEGRATE.md §5.2; wire contracts in the
// local noon-citadel checkout, src/http/oauth-token-http.ts):
//   GET  /portal/oauth/authorize — browser redirect target. Query uses app_id, NOT client_id.
//   POST /api/oauth/token        — HMAC-signed. Exchanges the callback code for
//                                  { token: { accessToken, refreshToken, ... }, profile: { ... } }.
//   POST /api/oauth/refresh      — HMAC-signed. Rotates the token pair; response is FLAT and the
//                                  refresh token is single-use.
// Nothing else in the SDK covers this app-as-IdP flow.

export interface CitadelOAuthConfig {
  baseUrl: string;
  appId: string;
  appSecret: string;
  redirectUri: string;
  // Injectable for tests; defaults to the global fetch.
  fetchImpl?: typeof fetch;
}

// The `profile` object returned by /api/oauth/token — Citadel resolves the staff profile
// server-side, so this single object is the app's only identity source. Fields are optional
// because the upstream payload is best-effort; resolve email as email || account?.email.
export interface CitadelProfile {
  id?: number;
  name?: string;
  email?: string;
  avatarUri?: string;
  locale?: string;
  userType?: string;
  account?: { email?: string; username?: string };
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  // Seconds until the access token expires.
  expiresIn: number;
  type: string | null;
}

export interface OAuthTokenResult {
  token: OAuthTokens;
  // Identity for the session cookie comes from here — null when Citadel sent no usable object.
  profile: CitadelProfile | null;
}

// /api/oauth/refresh returns the token fields flat (not wrapped in `token` like /api/oauth/token).
export type OAuthRefreshResult = OAuthTokens;

// Surfaces Citadel's HTTP status so callers can react to it — notably 403 (external-only account)
// and 401 (expired refresh token).
export class OAuthError extends Error {
  readonly status: number;
  readonly operation: string;
  constructor(message: string, status: number, operation: string) {
    super(message);
    this.name = 'OAuthError';
    this.status = status;
    this.operation = operation;
  }
}

// Bound client so callers (and tests) can depend on a small interface rather than the free functions.
export interface CitadelOAuthClient {
  authorizeUrl(args: { state: string }): string;
  token(args: { code: string }): Promise<OAuthTokenResult>;
  refresh(args: { refreshToken: string }): Promise<OAuthRefreshResult>;
}

const trimBase = (base: string): string => base.replace(/\/+$/, '');

// Outbound Citadel calls get a timeout so a hung upstream can't block a request (e.g. during
// /auth/callback) indefinitely and exhaust connections under load.
const DEFAULT_TIMEOUT_MS = 10_000;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const asNumber = (value: unknown): number => (typeof value === 'number' ? value : 0);
const asOptString = (value: unknown): string | null => (typeof value === 'string' ? value : null);

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function errorMessage(data: unknown, operation: string, status: number): string {
  if (isObject(data) && typeof data.error === 'string') {
    return data.error;
  }
  return `Citadel oauth ${operation} failed (HTTP ${status})`;
}

// Where the login redirect sends the browser. Citadel's authorize page expects `app_id` —
// `client_id` (the OAuth2 boilerplate name) is silently wrong (INTEGRATE.md §5.2 footgun table).
export function buildAuthorizeUrl(cfg: CitadelOAuthConfig, { state }: { state: string }): string {
  const query = new URLSearchParams({
    app_id: cfg.appId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    state,
  });
  return `${trimBase(cfg.baseUrl)}/portal/oauth/authorize?${query.toString()}`;
}

async function signedPost(cfg: CitadelOAuthConfig, path: string, body: unknown): Promise<unknown> {
  const doFetch = cfg.fetchImpl ?? fetch;
  const rawBody = JSON.stringify(body);
  const headers = buildHeaders(
    { baseUrl: cfg.baseUrl, appId: cfg.appId, appSecret: cfg.appSecret },
    path,
    rawBody,
  );
  const operation = path.split('/').pop() ?? path;
  const res = await doFetch(`${trimBase(cfg.baseUrl)}${path}`, {
    method: 'POST',
    headers,
    body: rawBody,
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });
  const data = await readJson(res);
  if (!res.ok) {
    throw new OAuthError(errorMessage(data, operation, res.status), res.status, operation);
  }
  return data;
}

function toTokens(source: Record<string, unknown>, operation: string): OAuthTokens {
  // Fail fast on a malformed response rather than coercing missing tokens to empty strings and
  // storing/using a blank access token downstream.
  if (typeof source.accessToken !== 'string' || typeof source.refreshToken !== 'string') {
    throw new OAuthError(
      `Citadel oauth ${operation} response missing token fields`,
      502,
      operation,
    );
  }
  return {
    accessToken: source.accessToken,
    refreshToken: source.refreshToken,
    expiresIn: asNumber(source.expiresIn),
    type: asOptString(source.type),
  };
}

// Best-effort projection of the exchange response's profile object. Never throws — a malformed
// profile becomes null and the caller decides whether that's fatal (it is: no email, no session).
function toProfile(source: unknown): CitadelProfile | null {
  if (!isObject(source)) {
    return null;
  }
  const account = isObject(source.account)
    ? {
        email: asOptString(source.account.email) ?? undefined,
        username: asOptString(source.account.username) ?? undefined,
      }
    : undefined;
  return {
    id: typeof source.id === 'number' ? source.id : undefined,
    name: asOptString(source.name) ?? undefined,
    email: asOptString(source.email) ?? undefined,
    avatarUri: asOptString(source.avatarUri) ?? undefined,
    locale: asOptString(source.locale) ?? undefined,
    userType: asOptString(source.userType) ?? undefined,
    account,
  };
}

export async function oauthToken(
  cfg: CitadelOAuthConfig,
  { code }: { code: string },
): Promise<OAuthTokenResult> {
  const data = await signedPost(cfg, '/api/oauth/token', { code });
  const obj = isObject(data) ? data : {};
  const tokenObj = isObject(obj.token) ? obj.token : {};
  return {
    token: toTokens(tokenObj, 'token'),
    profile: toProfile(obj.profile),
  };
}

export async function oauthRefresh(
  cfg: CitadelOAuthConfig,
  { refreshToken }: { refreshToken: string },
): Promise<OAuthRefreshResult> {
  const data = await signedPost(cfg, '/api/oauth/refresh', { refreshToken });
  return toTokens(isObject(data) ? data : {}, 'refresh');
}

export function createCitadelOAuthClient(cfg: CitadelOAuthConfig): CitadelOAuthClient {
  return {
    authorizeUrl: (args) => buildAuthorizeUrl(cfg, args),
    token: (args) => oauthToken(cfg, args),
    refresh: (args) => oauthRefresh(cfg, args),
  };
}
