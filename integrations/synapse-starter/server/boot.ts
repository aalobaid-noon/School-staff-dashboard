import type { PublishEventResult } from '@noonacademy/synapse-sdk';

export function formatBootLog(eventType: string, result: PublishEventResult): string {
  return result.status === 'accepted'
    ? `[synapse] OK — ${eventType} accepted eventId=${result.eventId}`
    : `[synapse] ${eventType} queued (couldn't reach Citadel on first try)`;
}
