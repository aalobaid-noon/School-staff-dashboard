// Refresh the committed registry snapshot (server/citadel-schema.ts) from Citadel's live
// GET /api/registry — MAINTAINER ONLY, run when cutting a template release. Builders never
// need this: in the workspace, the console and the SQL skill already read the live registry
// through GET /__synapse/registry (snapshot is only the labeled fallback).
//
//   SYNAPSE_APP_ID=... SYNAPSE_APP_SECRET=... [SYNAPSE_BASE_URL=...] npm run sync:registry
//
// The script hard-fails rather than falling back: it refuses to write unless the fetched text
// still carries every export this codebase imports (server/tables.ts, the SQL skill). After a
// successful write: `npm run verify` (typecheck proves the new text still satisfies consumers),
// then commit — and ship it like any template change (TEMPLATE_VERSION bump + UPGRADES.md
// entry once the fleet-upgrade machinery is on main).

import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchLiveRegistryText, snapshotLastUpdated } from '../server/registry.js';

// Everything the codebase imports from the snapshot module — the wire text must keep shipping
// these, or consumers break at typecheck. Grow this list if new imports appear.
const REQUIRED_EXPORTS = [
  'export const ATHENA_REGISTRY',
  'export interface AthenaTableMeta',
  'export const BUSINESS_RULES',
];

const SNAPSHOT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../server/citadel-schema.ts',
);
const DEFAULT_STAGING_BASE_URL = 'https://citadel.staging.noonedu.io';

async function main(): Promise<void> {
  const appId = process.env.SYNAPSE_APP_ID;
  const appSecret = process.env.SYNAPSE_APP_SECRET;
  const baseUrl = process.env.SYNAPSE_BASE_URL ?? DEFAULT_STAGING_BASE_URL;
  if (!appId || !appSecret) {
    console.error('[sync-registry] SYNAPSE_APP_ID and SYNAPSE_APP_SECRET must be set.');
    process.exitCode = 1;
    return;
  }

  console.log(`[sync-registry] fetching ${baseUrl}/api/registry …`);
  let text: string;
  try {
    text = await fetchLiveRegistryText({ baseUrl, appId, appSecret });
  } catch (err) {
    console.error(`[sync-registry] ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
    return;
  }

  const missing = REQUIRED_EXPORTS.filter((token) => !text.includes(token));
  if (missing.length > 0) {
    console.error(
      '[sync-registry] REFUSING to write — the live text no longer carries exports this repo ' +
        `imports:\n  ${missing.join('\n  ')}\n` +
        'The registry format has changed; reconcile server/tables.ts (and the SQL skill) first.',
    );
    process.exitCode = 1;
    return;
  }

  writeFileSync(SNAPSHOT_PATH, text);
  console.log(
    `[sync-registry] wrote ${text.length.toLocaleString()} bytes to server/citadel-schema.ts` +
      ` (registry dated: ${snapshotLastUpdated(text) ?? 'no "Last updated:" header found'}).`,
  );
  console.log(
    '[sync-registry] next: npm run verify, then commit — and ship with the release discipline.',
  );
}

void main();
