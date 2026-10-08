import { describe, expect, it } from 'vitest';
import type { AthenaQueryClient } from './athena.js';
import { PROBE_MAX_ROWS, rejectReason, runProbe, stripSqlComments } from './probe.js';

function mockClient(rows: Record<string, unknown>[]) {
  const seen: { sql: string; maxRows?: number; context?: string }[] = [];
  const client: AthenaQueryClient = {
    athenaQuery: async (opts) => {
      seen.push({ sql: opts.sql, maxRows: opts.maxRows, context: opts.context });
      return { columns: Object.keys(rows[0] ?? {}), rows };
    },
  };
  return { client, seen };
}

describe('stripSqlComments', () => {
  it('removes line and block comments', () => {
    expect(stripSqlComments('SELECT 1 -- a comment\nFROM t').trim()).toBe('SELECT 1 \nFROM t');
    expect(stripSqlComments('SELECT /* inline */ 1')).toBe('SELECT  1');
  });

  it('leaves comment-like text inside string literals alone', () => {
    const sql = "SELECT * FROM t WHERE name = 'a--b' AND code = 'x/*y*/z'";
    expect(stripSqlComments(sql)).toBe(sql);
  });

  it('handles a doubled quote escaping a quote inside a literal', () => {
    const sql = "SELECT * FROM t WHERE name = 'it''s fine' -- trailing";
    expect(stripSqlComments(sql).trim()).toBe("SELECT * FROM t WHERE name = 'it''s fine'");
  });
});

describe('rejectReason', () => {
  it('accepts the read forms a probe needs', () => {
    expect(rejectReason('SELECT COUNT(*) FROM noon2_datamart.d_course')).toBeNull();
    expect(rejectReason('WITH x AS (SELECT 1 AS n) SELECT n FROM x')).toBeNull();
    expect(rejectReason('SHOW CREATE TABLE noon2_core.some_table')).toBeNull();
    expect(rejectReason('DESCRIBE noon2_datamart.d_course')).toBeNull();
    expect(rejectReason('  \n  select 1  ')).toBeNull();
  });

  it('accepts a single trailing semicolon but refuses statement chaining', () => {
    expect(rejectReason('SELECT 1;')).toBeNull();
    expect(rejectReason('SELECT 1; SELECT 2')).toMatch(/exactly one statement/);
  });

  it('refuses anything that is not a read', () => {
    expect(rejectReason('DELETE FROM noon2_datamart.d_course')).toMatch(/read-only/);
    expect(rejectReason('DROP TABLE t')).toMatch(/read-only/);
    expect(rejectReason('')).toMatch(/needs a SQL statement/);
  });

  it('refuses a mutation smuggled past the leading keyword', () => {
    expect(rejectReason('WITH x AS (SELECT 1) DELETE FROM t')).toMatch(/read-only/);
  });

  it('is not fooled by a mutation hidden in a comment either way round', () => {
    // A comment must not make a legitimate probe look dangerous...
    expect(rejectReason('SELECT 1 -- DELETE FROM t')).toBeNull();
    // ...nor must it disguise a second statement.
    expect(rejectReason('SELECT 1 /* ; */ FROM t')).toBeNull();
  });
});

describe('runProbe', () => {
  it('refuses a non-read without ever touching the client', async () => {
    const { client, seen } = mockClient([]);
    const result = await runProbe(client, 'DELETE FROM t');
    expect(result.error).toMatch(/read-only/);
    expect(result.ranAt).toBeNull();
    expect(seen).toHaveLength(0);
  });

  it('returns configured:false when secrets are missing (never throws)', async () => {
    const result = await runProbe(null, 'SELECT 1');
    expect(result.configured).toBe(false);
    expect(result.error).toBeNull();
    expect(result.rows).toEqual([]);
  });

  it('runs a valid probe and stamps when it hit the lake', async () => {
    const { client, seen } = mockClient([{ n: 1240 }]);
    const result = await runProbe(client, 'SELECT COUNT(*) AS n FROM noon2_datamart.d_course');

    expect(result.error).toBeNull();
    expect(result.rows).toEqual([{ n: 1240 }]);
    expect(result.columns).toEqual(['n']);
    expect(result.ranAt).not.toBeNull();
    // Probes are labelled distinctly in Citadel's read ledger and capped well below a read.
    expect(seen[0]?.context).toBe('probe: cross-check');
    expect(seen[0]?.maxRows).toBe(PROBE_MAX_ROWS);
  });

  it('surfaces a query failure as an error field rather than throwing', async () => {
    const client: AthenaQueryClient = {
      athenaQuery: async () => {
        throw new Error('SYNTAX_ERROR: line 1:8: Column does not exist');
      },
    };
    const result = await runProbe(client, 'SELECT nope FROM noon2_datamart.d_course');
    expect(result.error).toMatch(/Column does not exist/);
    expect(result.ranAt).toBeNull();
  });

  it('clamps a runaway probe to PROBE_MAX_ROWS and says it was truncated', async () => {
    const rows = Array.from({ length: PROBE_MAX_ROWS + 25 }, (_, i) => ({ i }));
    const { client } = mockClient(rows);
    const result = await runProbe(client, 'SELECT i FROM t LIMIT 1000');
    expect(result.rows).toHaveLength(PROBE_MAX_ROWS);
    expect(result.truncated).toBe(true);
  });
});
