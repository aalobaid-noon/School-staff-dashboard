// Orchestrates one baked read: registry lookup -> cache (hit | miss) -> athenaQuery -> rows.
// Resilient by construction: a null client (secrets missing) yields an empty, configured:false
// result, and a failed read surfaces an error field — neither path 500s.

import { type AthenaQueryClient, type AthenaRows, runAthenaQuery } from './athena.js';
import { type Metric, metricsFor } from './metrics.js';
import { getBakedQuery } from './queries/index.js';
import { createQueryCache, type QueryCache } from './query-cache.js';

export interface ReadResult {
  name: string;
  title: string;
  description: string;
  sql: string;
  registryVersion: string;
  skillVersion: string;
  // Resolved definitions for whatever this read declared (server/metrics.ts). Travels WITH the
  // rows so a page can show what its number means without a second request — a number and its
  // definition arriving separately is how they drift apart.
  metrics: Metric[];
  columns: string[];
  rows: Record<string, unknown>[];
  truncated: boolean; // rows capped at the framework MAX_ROWS backstop
  dataAsOf: string | null; // ISO time the rows were fetched from the lake; null if not fetched
  cached: boolean;
  configured: boolean;
  error: string | null;
}

// Module-level cache so hits survive across requests for the life of the process.
const defaultCache = createQueryCache<AthenaRows>();

// The purpose label Citadel records for every page of this read (athena_read_log.read_context,
// via the SDK's context arg → x-synapse-read-context header). "name: title" when it fits the
// header budget, else the name alone — the name is the stable identifier, the title is garnish.
const READ_CONTEXT_MAX = 120;
export function readContext(query: { name: string; title: string }): string {
  const labeled = `${query.name}: ${query.title}`;
  return labeled.length <= READ_CONTEXT_MAX ? labeled : query.name;
}

// Returns null when `name` is unknown (route answers 404); otherwise always a ReadResult.
export async function runRead(
  client: AthenaQueryClient | null,
  name: string,
  deps: { cache?: QueryCache<AthenaRows> } = {},
): Promise<ReadResult | null> {
  const query = getBakedQuery(name);
  if (!query) return null;

  const base = {
    name: query.name,
    title: query.title,
    description: query.description,
    sql: query.sql,
    registryVersion: query.registryVersion,
    skillVersion: query.skillVersion,
    metrics: metricsFor(query.metrics),
  };

  if (!client) {
    return {
      ...base,
      columns: [],
      rows: [],
      truncated: false,
      dataAsOf: null,
      cached: false,
      configured: false,
      error: null,
    };
  }

  const cache = deps.cache ?? defaultCache;
  try {
    const { value, fetchedAt, cached } = await cache.get(query.name, () =>
      runAthenaQuery(client, query.sql, query.maxRows, readContext(query)),
    );
    return {
      ...base,
      columns: value.columns,
      rows: value.rows,
      truncated: value.truncated,
      dataAsOf: new Date(fetchedAt).toISOString(),
      cached,
      configured: true,
      error: null,
    };
  } catch (err) {
    return {
      ...base,
      columns: [],
      rows: [],
      truncated: false,
      dataAsOf: null,
      cached: false,
      configured: true,
      error: err instanceof Error ? err.message : 'read failed',
    };
  }
}
