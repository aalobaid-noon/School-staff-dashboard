import type { PublishLogEntry } from '@noonacademy/synapse-sdk';
import { describe, expect, it } from 'vitest';
import { buildOverview } from './overview.js';

const base = { appId: 'app_123', baseUrl: 'https://citadel.staging.noonedu.io' };

function publish(partial: Partial<PublishLogEntry>): PublishLogEntry {
  return {
    type: 'app_booted',
    status: 'accepted',
    attempts: 1,
    at: '2026-06-28T00:00:00Z',
    ...partial,
  };
}

describe('buildOverview', () => {
  it('reports not-connected with the config error when secrets are missing', () => {
    const o = buildOverview({
      ...base,
      appId: null,
      configError: 'Missing required Replit Secret(s): SYNAPSE_APP_ID.',
      recentPublishes: [],
    });
    expect(o.configured).toBe(false);
    expect(o.connection.ok).toBe(false);
    expect(o.connection.detail).toMatch(/secrets missing/i);
  });

  it('reports connected when a recent publish was accepted', () => {
    const o = buildOverview({
      ...base,
      configError: null,
      recentPublishes: [publish({ status: 'accepted', eventId: 99 })],
    });
    expect(o.configured).toBe(true);
    expect(o.connection.ok).toBe(true);
    expect(o.connection.detail).toContain('eventId=99');
  });

  // The regression this guards: the detail used to say "staging Citadel is reachable" no matter
  // what SYNAPSE_BASE_URL was set to, so an app pointed at production read as a sandbox.
  it('names the Citadel it actually reached, not a hardcoded environment', () => {
    const prod = buildOverview({
      ...base,
      baseUrl: 'https://citadel.studyatnoon.com',
      configError: null,
      recentPublishes: [publish({ status: 'accepted', eventId: 2263 })],
    });
    expect(prod.connection.detail).toContain('citadel.studyatnoon.com');
    expect(prod.connection.detail).not.toMatch(/staging/i);

    const staging = buildOverview({
      ...base,
      configError: null,
      recentPublishes: [publish({ status: 'accepted', eventId: 7 })],
    });
    expect(staging.connection.detail).toContain('citadel.staging.noonedu.io');
  });

  it('falls back to the raw baseUrl rather than throwing on an unparseable one', () => {
    const o = buildOverview({
      ...base,
      baseUrl: 'not-a-url',
      configError: null,
      recentPublishes: [publish({ status: 'accepted', eventId: 1 })],
    });
    expect(o.connection.detail).toContain('not-a-url');
  });

  it('configured but not-yet-connected when no publish has settled', () => {
    const o = buildOverview({ ...base, configError: null, recentPublishes: [] });
    expect(o.configured).toBe(true);
    expect(o.connection.ok).toBe(false);
    expect(o.connection.detail).toMatch(/in flight/i);
  });

  it('surfaces a failed publish detail when nothing was accepted', () => {
    const o = buildOverview({
      ...base,
      configError: null,
      recentPublishes: [publish({ status: 'failed_permanent', error: 'HTTP 401' })],
    });
    expect(o.connection.ok).toBe(false);
    expect(o.connection.detail).toContain('HTTP 401');
  });
});
