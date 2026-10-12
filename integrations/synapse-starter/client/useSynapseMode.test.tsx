// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSynapseMode } from './useSynapseMode';

function stubFetch(res: { ok: boolean; contentType: string } | Error) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      if (res instanceof Error) {
        throw res;
      }
      return {
        ok: res.ok,
        headers: { get: () => res.contentType },
        json: async () => ({}),
      };
    }),
  );
}

describe('useSynapseMode', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves to workspace when the endpoint returns JSON', async () => {
    stubFetch({ ok: true, contentType: 'application/json' });
    const { result } = renderHook(() => useSynapseMode());
    await waitFor(() => expect(result.current).toBe('workspace'));
  });

  it('resolves to published when the request falls through to the SPA (html)', async () => {
    stubFetch({ ok: true, contentType: 'text/html' });
    const { result } = renderHook(() => useSynapseMode());
    await waitFor(() => expect(result.current).toBe('published'));
  });

  it('defaults to published (never the console) when the probe errors', async () => {
    stubFetch(new Error('network'));
    const { result } = renderHook(() => useSynapseMode());
    await waitFor(() => expect(result.current).toBe('published'));
  });
});
