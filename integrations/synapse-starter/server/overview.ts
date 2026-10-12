// App identity + a live-ish connection signal for the console's Home/Settings tabs. The SDK exposes no
// dedicated ping, so the most honest connectivity proof we have without extra traffic is the
// outcome of the boot publish round-trip — if Citadel accepted an event, secrets reached the
// server, the request was HMAC-signed, and the configured Citadel was reachable.
//
// "The configured Citadel", never "staging": SYNAPSE_BASE_URL can point this app at production,
// and this string is the one place in the console whose whole job is to say what you're connected
// to. A clone showing live production numbers under a panel that reads "staging" invites someone
// to treat real data as a sandbox — so the detail names the host it actually reached.

import type { PublishLogEntry } from '@noonacademy/synapse-sdk';

export interface OverviewProjection {
  appId: string | null;
  baseUrl: string;
  configured: boolean;
  configError: string | null;
  connection: {
    ok: boolean;
    detail: string;
  };
}

// The host alone, so the status line stays short and reads as a place. Falls back to the raw
// value when it isn't a parseable URL — a baseUrl that looks wrong is still more useful than a
// guess, and this projection must never throw on bad config.
function citadelName(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}

export function buildOverview(input: {
  appId: string | null;
  baseUrl: string;
  configError: string | null;
  recentPublishes: PublishLogEntry[];
}): OverviewProjection {
  const { appId, baseUrl, configError, recentPublishes } = input;
  const configured = configError === null;

  let connection: OverviewProjection['connection'];
  if (!configured) {
    connection = {
      ok: false,
      detail: 'Secrets missing — add them in the Secrets pane, then re-run.',
    };
  } else {
    const accepted = recentPublishes.find((e) => e.status === 'accepted');
    if (accepted) {
      connection = {
        ok: true,
        detail: `Last publish accepted (eventId=${accepted.eventId}) — ${citadelName(baseUrl)} is reachable.`,
      };
    } else {
      const settled = recentPublishes[0];
      connection = settled
        ? {
            ok: false,
            detail: `Last publish ${settled.status}${settled.error ? `: ${settled.error}` : ''}.`,
          }
        : {
            ok: false,
            detail: 'No publishes have settled yet — the boot event may still be in flight.',
          };
    }
  }

  return { appId, baseUrl, configured, configError, connection };
}
