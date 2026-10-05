// Parse the live registry TEXT (Citadel GET /api/registry) into the structures the Get-data tab
// browses — WITHOUT executing the fetched module. The registry is an authored TypeScript file in
// which every table is `const <key>: AthenaTableMeta = { ... };`; we split on that declaration and
// pull the browse-facing fields by regex. The text is treated as DATA, never eval'd (the same hard
// rule server/registry.ts states) — so a hostile registry can at worst produce junk strings, never
// run code.
//
// Quote style is either ' or " (the S3 master uses ", the committed snapshot uses '), so every
// matcher accepts both and understands backslash escapes. exampleQueries are backtick template
// literals; backticks never occur inside Trino SQL, so a plain backtick split is safe.
//
// Robustness contract: this is best-effort. `parseRegistryTables` returns whatever it could parse;
// the caller (server/index.ts) compares the count against the committed snapshot and falls back to
// the snapshot wholesale when the live parse looks short or throws. A format drift therefore
// degrades to "slightly stale browse", never a broken tab.

import type { TableColumnProjection, TableProjection } from './tables.js';

// `const NAME: AthenaTableMeta =` — the per-table section boundary.
const TABLE_SECTION = /(?:export\s+)?const\s+([A-Za-z0-9_]+)\s*:\s*AthenaTableMeta\s*=/gm;
// A top-level `const NAME =` WITHOUT the type — the trailing aggregate export (ATHENA_REGISTRY),
// which must not bleed into the last table's section.
const NON_TABLE_CONST = /^(?:export\s+)?const\s+[A-Za-z0-9_]+\s*=/m;

interface Section {
  key: string;
  body: string;
}

function sections(text: string): Section[] {
  const marks: { key: string; start: number }[] = [];
  for (const m of text.matchAll(TABLE_SECTION)) {
    marks.push({ key: m[1] as string, start: m.index });
  }
  return marks.map((mk, i) => {
    const end = marks[i + 1]?.start ?? text.length;
    const slice = text.slice(mk.start, end);
    const boundary = slice.search(NON_TABLE_CONST);
    return { key: mk.key, body: boundary > 0 ? slice.slice(0, boundary) : slice };
  });
}

function unquote(s: string): string {
  return s.replace(/\\(['"`\\])/g, '$1');
}

// One quoted string literal, escape-aware: `'a\'b'` or `"a\"b"`. Global so callers can pull all.
const STRING_LITERAL = /(['"])((?:\\.|(?!\1)[\s\S])*)\1/g;

// A single-line quoted scalar field, e.g. `database: "noon2_datamart"`. `\b` keeps `table:` from
// matching inside `AthenaTableMeta`.
function scalar(body: string, field: string): string | null {
  const m = body.match(new RegExp(`\\b${field}\\s*:\\s*(['"])((?:\\\\.|(?!\\1)[\\s\\S])*)\\1`));
  return m ? unquote(m[2] as string) : null;
}

// The description field may be several string literals joined with `+`. Capture the block up to the
// next 2-space-indented field key, then concatenate every literal in it (matching JS `+` on
// adjacent strings, which inserts no separator).
function description(body: string): string {
  const block = body.match(/\bdescription\s*:\s*([\s\S]*?)\n {2}[A-Za-z_]\w*\s*:/);
  if (!block) return scalar(body, 'description') ?? '';
  return [...(block[1] as string).matchAll(STRING_LITERAL)]
    .map((m) => unquote(m[2] as string))
    .join('');
}

function columns(body: string): TableColumnProjection[] {
  const arr = body.match(/\bcolumns\s*:\s*\[([\s\S]*?)\n {2}\]/);
  if (!arr) return [];
  // Column objects have no nested braces, so `{…}` matches each one whole (across newlines).
  const objects = (arr[1] as string).match(/\{[^{}]*\}/g) ?? [];
  const cols: TableColumnProjection[] = [];
  for (const obj of objects) {
    const name = scalar(obj, 'name');
    if (!name) continue;
    const col: TableColumnProjection = {
      name,
      type: scalar(obj, 'type') ?? '',
      description: scalar(obj, 'description') ?? '',
    };
    const enumBlock = obj.match(/\benumValues\s*:\s*\[([^\]]*)\]/);
    if (enumBlock) {
      const values = [...(enumBlock[1] as string).matchAll(STRING_LITERAL)].map((m) =>
        unquote(m[2] as string),
      );
      if (values.length > 0) col.enumValues = values;
    }
    cols.push(col);
  }
  return cols;
}

function exampleQueries(body: string): string[] {
  const arr = body.match(/\bexampleQueries\s*:\s*\[([\s\S]*?)\n {2}\]/);
  if (!arr) return [];
  // Backtick template literals; backticks never appear inside Trino SQL, so a plain split is safe.
  return [...(arr[1] as string).matchAll(/`([\s\S]*?)`/g)].map((m) => m[1] as string);
}

// Parse the registry text into browse projections. Tables missing a database or columns are
// dropped as unparseable rather than shown half-empty.
export function parseRegistryTables(text: string): TableProjection[] {
  return sections(text)
    .map(({ key, body }) => ({
      key,
      database: scalar(body, 'database') ?? '',
      table: scalar(body, 'table') ?? key,
      description: description(body),
      grain: scalar(body, 'grain') ?? '',
      refreshCadence: scalar(body, 'refreshCadence') ?? '',
      accessLevel: scalar(body, 'accessLevel') ?? '',
      columns: columns(body),
      exampleQueries: exampleQueries(body),
    }))
    .filter((t) => t.database.length > 0 && t.columns.length > 0);
}

// Decide what the Get-data tab browses: the live-parsed registry, or the committed snapshot.
// Live is trusted only when Citadel actually served live text AND the parse yields at least as many
// tables as the snapshot — a short parse (format drift dropped tables) is treated as untrustworthy
// and falls back, so the tab never silently shows a truncated list.
export function chooseBrowseTables(
  registry: { source: 'live' | 'snapshot'; text: string },
  snapshot: TableProjection[],
): { tables: TableProjection[]; source: 'live' | 'snapshot' } {
  if (registry.source === 'live') {
    const parsed = parseRegistryTables(registry.text);
    if (parsed.length >= snapshot.length) {
      return { tables: parsed, source: 'live' };
    }
  }
  return { tables: snapshot, source: 'snapshot' };
}
