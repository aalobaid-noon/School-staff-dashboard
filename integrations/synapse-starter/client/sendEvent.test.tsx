import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendEvent } from './sendEvent';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('sendEvent', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('POSTs { type, payload } to /api/events and returns the accepted result', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse(200, { status: 'accepted', eventId: 42 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendEvent('game.round_won', { studentId: 1 });

    expect(result).toEqual({ ok: true, status: 'accepted', eventId: 42 });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/events',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse((fetchMock.mock.calls[0]?.[1]?.body as string) ?? '{}');
    expect(body).toEqual({ type: 'game.round_won', payload: { studentId: 1 } });
  });

  it('surfaces the server error message on failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(400, { error: 'an event "type" is required' })),
    );
    const result = await sendEvent('');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('an event "type" is required');
  });

  it('returns a friendly error when the request throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    const result = await sendEvent('x');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('network down');
  });
});
