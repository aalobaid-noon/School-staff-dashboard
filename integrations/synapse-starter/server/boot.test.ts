import { describe, expect, it } from 'vitest';
import { formatBootLog } from './boot.js';

describe('formatBootLog', () => {
  it('reports the eventId when Citadel accepted the event', () => {
    expect(formatBootLog('app_booted', { status: 'accepted', eventId: 42 })).toBe(
      '[synapse] OK — app_booted accepted eventId=42',
    );
  });

  it('reports a queued fallback when Citadel was unreachable on the first try', () => {
    expect(formatBootLog('app_booted', { status: 'queued' })).toBe(
      "[synapse] app_booted queued (couldn't reach Citadel on first try)",
    );
  });
});
