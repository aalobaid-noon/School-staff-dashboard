// Projection of the in-repo Citadel registry snapshot (server/citadel-schema.ts — the live
// source is Citadel's GET /api/registry) into the shape the Get data tab consumes. Deliberately
// a subset of AthenaTableMeta — the workspace browser shows what a builder needs to write a
// read, not the role/scope internals.

import { ATHENA_REGISTRY, type AthenaTableMeta } from './citadel-schema.js';

export interface TableColumnProjection {
  name: string;
  type: string;
  description: string;
  enumValues?: string[];
}

export interface TableProjection {
  key: string;
  database: string;
  table: string;
  description: string;
  grain: string;
  refreshCadence: string;
  accessLevel: string;
  columns: TableColumnProjection[];
  exampleQueries: string[];
}

export function projectTable(meta: AthenaTableMeta): TableProjection {
  return {
    key: meta.key,
    database: meta.database,
    table: meta.table,
    description: meta.description,
    grain: meta.grain,
    refreshCadence: meta.refreshCadence,
    accessLevel: meta.accessLevel,
    columns: meta.columns.map((c) => ({
      name: c.name,
      type: c.type,
      description: c.description,
      // Only carry enumValues when present, so the client can branch on its absence.
      ...(c.enumValues && c.enumValues.length > 0 ? { enumValues: c.enumValues } : {}),
    })),
    exampleQueries: meta.exampleQueries ?? [],
  };
}

export function projectTables(
  registry: Record<string, AthenaTableMeta> = ATHENA_REGISTRY,
): TableProjection[] {
  return Object.values(registry).map(projectTable);
}
