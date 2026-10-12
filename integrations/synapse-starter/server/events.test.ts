import type { PublishLogEntry } from '@noonacademy/synapse-sdk';
import { describe, expect, it } from 'vitest';
import { recentPublishes } from './events.js';

describe('recentPublishes', () => {
  it('returns an empty list (never throws) when the client is null', () => {
    expect(recentPublishes(null)).toEqual([]);
  });

  it('returns the client publish-log, capped at 50, when a client is present', () => {
    const entries: PublishLogEntry[] = [
      {
        type: 'app_booted',
        status: 'accepted',
        eventId: 7,
        attempts: 1,
        at: '2026-06-25T10:00:00.000Z',
      },
    ];
    const calls: Array<{ limit?: number }> = [];
    const client = {
      getRecentPublishes: (opts?: { limit?: number }) => {
        calls.push(opts ?? {});
        return entries;
      },
    };

    expect(recentPublishes(client)).toEqual(entries);
    expect(calls).toEqual([{ limit: 50 }]);
  });
});
