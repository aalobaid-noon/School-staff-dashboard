// Registry of baked reads, keyed by query name. Adding a read = adding a
// server/queries/<name>.sql.ts file and registering it here; the read route and the Read
// tab pick it up automatically.

import * as coursesByType from './courses-by-type.sql.js';

export interface BakedQuery {
  name: string;
  title: string;
  description: string;
  sql: string;
  registryVersion: string;
  skillVersion: string;
  // Optional per-read row ceiling handed to Citadel's SQL guard. Omit to use the platform max
  // (server/athena.ts MAX_ROWS). A read that returns rows and wants more than the SDK's default
  // 1000 must set this AND carry a matching explicit top-level `LIMIT` in its SQL.
  maxRows?: number;
  // Names of the metric definitions this read implements (server/metrics.ts). Optional, and
  // absent on most reads — declare one the moment a word like "active" means something specific
  // that another read must agree with. Resolved definitions travel to the page with the rows.
  metrics?: readonly string[];
}

// Structural shape of a query module — `maxRows` is optional so most modules can omit it.
interface QueryModule {
  name: string;
  title: string;
  description: string;
  sql: string;
  registryVersion: string;
  skillVersion: string;
  maxRows?: number;
  metrics?: readonly string[];
}

function toBakedQuery(m: QueryModule): BakedQuery {
  return {
    name: m.name,
    title: m.title,
    description: m.description,
    sql: m.sql,
    registryVersion: m.registryVersion,
    skillVersion: m.skillVersion,
    maxRows: m.maxRows,
    metrics: m.metrics,
  };
}

// Null-prototype map so a request for an inherited key (e.g. `__proto__`) resolves to
// undefined instead of Object.prototype — otherwise getBakedQuery would treat it as a hit.
export const BAKED_QUERIES: Record<string, BakedQuery> = Object.assign(Object.create(null), {
  [coursesByType.name]: toBakedQuery(coursesByType),
});

export function getBakedQuery(name: string): BakedQuery | null {
  return BAKED_QUERIES[name] ?? null;
}

export function listBakedQueries(): BakedQuery[] {
  return Object.values(BAKED_QUERIES);
}
