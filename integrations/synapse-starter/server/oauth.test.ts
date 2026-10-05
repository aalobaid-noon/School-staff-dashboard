import { describe, expect, it } from 'vitest';
import {
  buildAuthorizeUrl,
  type CitadelOAuthConfig,
  OAuthError,
  oauthRefresh,
  oauthToken,
} from './oauth.js';

interface Captured {
  url: string;
  init: RequestInit | undefined;
}

function stubFetch(response: { status: number; body: unknown }): {
  fetchImpl: typeof fetch;
  calls: Captured[];
} {
  const calls: Captured[] = [];
  const fetchImpl = (async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify(response.body), {
      status: response.status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const baseConfig: Omit<CitadelOAuthConfig, 'fetchImpl'> = {
  baseUrl: 'https://citadel.example',
  appId: 'app_test',
  appSecret: 'app-secret',
  redirectUri: 'https://app.example/oauth/callback',
};

function headerNames(init: RequestInit | undefined): string[] {
  return Object.keys((init?.headers ?? {}) as Record<string, string>).map((k) => k.toLowerCase());
}

describe('oauth client', () => {
  it('builds the authorize URL with app_id (not client_id), redirect_uri, response_type, state', () => {
    const url = new URL(buildAuthorizeUrl(baseConfig, { state: 'csrf-123' }));

    expect(url.origin + url.pathname).toBe('https://citadel.example/portal/oauth/authorize');
    expect(url.searchParams.get('app_id')).toBe('app_test');
    expect(url.searchParams.get('client_id')).toBeNull();
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.example/oauth/callback');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('state')).toBe('csrf-123');
  });

  it('exchanges a code with an HMAC-signed POST and returns the nested token pair + profile', async () => {
    const { fetchImpl, calls } = stubFetch({
      status: 200,
      body: {
        token: { accessToken: 'at1', refreshToken: 'rt1', type: 'Bearer', expiresIn: 600 },
        profile: { id: 7, name: 'Dana', userType: 'ADMIN', account: { email: 'dana@non.sa' } },
      },
    });

    const result = await oauthToken({ ...baseConfig, fetchImpl }, { code: 'code_abc' });

    expect(calls[0]?.url).toBe('https://citadel.example/api/oauth/token');
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ code: 'code_abc' });
    const names = headerNames(calls[0]?.init);
    expect(names).toContain('x-citadel-signature');
    expect(names).toContain('x-replit-app-id');
    expect(result.token).toEqual({
      accessToken: 'at1',
      refreshToken: 'rt1',
      type: 'Bearer',
      expiresIn: 600,
    });
    expect(result.profile).toMatchObject({
      id: 7,
      name: 'Dana',
      account: { email: 'dana@non.sa' },
    });
  });

  it('surfaces a 403 on the exchange (non-staff account) as an OAuthError', async () => {
    const { fetchImpl } = stubFetch({ status: 403, body: { error: 'EXTERNAL_USER only' } });
    await expect(oauthToken({ ...baseConfig, fetchImpl }, { code: 'x' })).rejects.toMatchObject({
      name: 'OAuthError',
      status: 403,
    });
  });

  it('returns a null profile when the exchange response carries none', async () => {
    const { fetchImpl } = stubFetch({
      status: 200,
      body: { token: { accessToken: 'at1', refreshToken: 'rt1', expiresIn: 600 } },
    });
    const result = await oauthToken({ ...baseConfig, fetchImpl }, { code: 'code_abc' });
    expect(result.profile).toBeNull();
  });

  it('refreshes with a flat (not token-wrapped) response shape', async () => {
    const { fetchImpl, calls } = stubFetch({
      status: 200,
      body: { accessToken: 'at2', refreshToken: 'rt2', type: 'Bearer', expiresIn: 600 },
    });

    const result = await oauthRefresh({ ...baseConfig, fetchImpl }, { refreshToken: 'rt1' });

    expect(calls[0]?.url).toBe('https://citadel.example/api/oauth/refresh');
    expect(headerNames(calls[0]?.init)).toContain('x-citadel-signature');
    expect(result).toEqual({
      accessToken: 'at2',
      refreshToken: 'rt2',
      type: 'Bearer',
      expiresIn: 600,
    });
  });

  it('surfaces a 401 from refresh as an OAuthError', async () => {
    const { fetchImpl } = stubFetch({ status: 401, body: { error: 'expired' } });
    await expect(
      oauthRefresh({ ...baseConfig, fetchImpl }, { refreshToken: 'stale' }),
    ).rejects.toBeInstanceOf(OAuthError);
  });
});
