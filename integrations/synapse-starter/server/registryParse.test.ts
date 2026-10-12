import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { chooseBrowseTables, parseRegistryTables } from './registryParse.js';
import { projectTables, type TableProjection } from './tables.js';

const here = dirname(fileURLToPath(import.meta.url));
const snapshotText = readFileSync(resolve(here, './citadel-schema.ts'), 'utf8');

// The strongest guarantee we can give: parsing the committed snapshot's TEXT must reproduce, table
// for table and field for field, exactly what importing the same module produces. Prove it against
// the real registry (~76 tables) so a parser regression can't slip through on a hand-picked sample.
describe('parseRegistryTables — round-trips the real registry', () => {
  const parsed = parseRegistryTables(snapshotText);
  const imported = projectTables();

  it('finds every table the import exposes', () => {
    expect(parsed.map((t) => t.key).sort()).toEqual(imported.map((t) => t.key).sort());
    expect(parsed.length).toBe(imported.length);
  });

  it('parses every field the browse tab shows, identically to the import', () => {
    const byKey = new Map(parsed.map((t) => [t.key, t]));
    for (const want of imported) {
      expect(byKey.get(want.key)).toEqual(want);
    }
  });

  it('handles double-quoted text too (the S3 master uses double quotes)', () => {
    // The committed snapshot is single-quoted (biome); the S3 source is double-quoted. Convert a
    // representative slice and confirm the parser is quote-style agnostic.
    const doubleQuoted = snapshotText.replace(/'/g, '"');
    const fromDouble = parseRegistryTables(doubleQuoted);
    expect(fromDouble.length).toBe(parsed.length);
  });
});

describe('parseRegistryTables — resilience', () => {
  it('returns [] on text with no table declarations', () => {
    expect(parseRegistryTables('export const x = 1;\n// nothing here')).toEqual([]);
  });

  it('drops a table that has no columns', () => {
    const text = `const broken: AthenaTableMeta = {\n  key: 'broken',\n  database: 'db',\n  table: 'broken',\n  description: 'x',\n  grain: 'x',\n  refreshCadence: 'x',\n  accessLevel: 'all',\n  columns: [\n  ],\n};`;
    expect(parseRegistryTables(text)).toEqual([]);
  });

  it('parses a minimal well-formed table, enums and all', () => {
    const text = `const t: AthenaTableMeta = {\n  key: 't',\n  database: 'db',\n  table: 't',\n  description: 'A ' +\n    'joined description.',\n  grain: '1 row',\n  refreshCadence: 'Every 12 hours',\n  accessLevel: 'all',\n  columns: [\n    { name: 'a', type: 'int', description: 'col a' },\n    { name: 'b', type: 'varchar', description: 'col b', enumValues: ['X', 'Y'] },\n  ],\n};`;
    expect(parseRegistryTables(text)).toEqual([
      {
        key: 't',
        database: 'db',
        table: 't',
        description: 'A joined description.',
        grain: '1 row',
        refreshCadence: 'Every 12 hours',
        accessLevel: 'all',
        columns: [
          { name: 'a', type: 'int', description: 'col a' },
          { name: 'b', type: 'varchar', description: 'col b', enumValues: ['X', 'Y'] },
        ],
        exampleQueries: [],
      },
    ]);
  });
});

describe('chooseBrowseTables — live-with-fallback decision', () => {
  const snapshot = projectTables();
  const liveText = readFileSync(resolve(here, './citadel-schema.ts'), 'utf8');

  it('serves the live parse when Citadel is live and the parse is complete', () => {
    const { tables, source } = chooseBrowseTables({ source: 'live', text: liveText }, snapshot);
    expect(source).toBe('live');
    expect(tables.length).toBe(snapshot.length);
  });

  it('serves live even when live has MORE tables than the snapshot', () => {
    const extra = `${liveText}\nconst z_extra: AthenaTableMeta = {\n  key: 'z_extra',\n  database: 'db',\n  table: 'z_extra',\n  description: 'x',\n  grain: 'x',\n  refreshCadence: 'x',\n  accessLevel: 'all',\n  columns: [\n    { name: 'a', type: 'int', description: 'd' },\n  ],\n};\nexport const ATHENA_REGISTRY = {};`;
    const { tables, source } = chooseBrowseTables({ source: 'live', text: extra }, snapshot);
    expect(source).toBe('live');
    expect(tables.length).toBe(snapshot.length + 1);
  });

  it('falls back to the snapshot when the live parse comes up short (format drift)', () => {
    const truncated = 'const only: AthenaTableMeta = {\n  key: 1'; // unparseable / near-empty
    const { tables, source } = chooseBrowseTables({ source: 'live', text: truncated }, snapshot);
    expect(source).toBe('snapshot');
    expect(tables).toBe(snapshot);
  });

  it('uses the snapshot whenever Citadel is not live (no live parse attempted)', () => {
    const empty: TableProjection[] = [];
    const { source } = chooseBrowseTables({ source: 'snapshot', text: '' }, empty);
    expect(source).toBe('snapshot');
  });
});
