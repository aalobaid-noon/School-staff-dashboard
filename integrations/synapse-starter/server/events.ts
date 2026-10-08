import type { PublishLogEntry, SynapseClient } from '@noonacademy/synapse-sdk';

const RECENT_LIMIT = 50;

// A null client means secrets are missing — return an empty list, never a 500.
// The SDK records only terminal outcomes (accepted / failed), so queued or
// in-flight events never appear here.
export function recentPublishes(
  client: Pick<SynapseClient, 'getRecentPublishes'> | null,
): PublishLogEntry[] {
  return client ? client.getRecentPublishes({ limit: RECENT_LIMIT }) : [];
}
