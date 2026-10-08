import { describe, expect, it } from 'vitest';
import { normalizeAthenaResult, runAthenaQuery } from './athena.js';

describe('normalizeAthenaResult', () => {
  it('passes through the canonical { columns, rows } shape', () => {
    const raw = {
      columns: ['course_type', 'course_count'],
      rows: [
        { course_type: 'SCHOOL', course_count: 10 },
        { course_type: 'O2O', course_count: 4 },
      ],
    };
    expect(normalizeAthenaResult(raw)).toEqual({ ...raw, truncated: false });
  });

  it('derives columns (first-seen order) from a bare array of row objects', () => {
    const result = normalizeAthenaResult([
      { a: 1, b: 2 },
      { a: 3, c: 4 },
    ]);
    expect(result.columns).toEqual(['a', 'b', 'c']);
    expect(result.rows).toHaveLength(2);
  });

  it('derives columns when { rows } has no columns array', () => {
    const result = normalizeAthenaResult({ rows: [{ x: 1 }] });
    expect(result.columns).toEqual(['x']);
  });

  it('collapses unexpected shapes to an empty result instead of throwing', () => {
    const empty = { columns: [], rows: [], truncated: false };
    expect(normalizeAthenaResult(null)).toEqual(empty);
    expect(normalizeAthenaResult('nope')).toEqual(empty);
    expect(normalizeAthenaResult({ data: 1 })).toEqual(empty);
  });

  it('caps oversized results and flags truncation', () => {
    const big = Array.from({ length: 100_005 }, (_, i) => ({ i }));
    const result = normalizeAthenaResult(big);
    expect(result.rows).toHaveLength(100_000);
    expect(result.truncated).toBe(true);
  });
});

describe('runAthenaQuery', () => {
  it('calls athenaQuery with the SQL and normalizes the result', async () => {
    const calls: Array<{ sql: string; maxRows?: number }> = [];
    const client = {
      athenaQuery: async (opts: { sql: string; maxRows?: number }) => {
        calls.push(opts);
        return [{ n: 1 }];
      },
    };
    const result = await runAthenaQuery(client, 'SELECT 1');
    // Defaults maxRows to the platform hard cap so the SDK's lower 1000 default can't cap reads.
    expect(calls).toEqual([{ sql: 'SELECT 1', maxRows: 100_000 }]);
    expect(result).toEqual({ columns: ['n'], rows: [{ n: 1 }], truncated: false });
  });

  it('forwards an explicit maxRows override', async () => {
    const calls: Array<{ sql: string; maxRows?: number }> = [];
    const client = {
      athenaQuery: async (opts: { sql: string; maxRows?: number }) => {
        calls.push(opts);
        return [];
      },
    };
    await runAthenaQuery(client, 'SELECT 1', 500);
    expect(calls).toEqual([{ sql: 'SELECT 1', maxRows: 500 }]);
  });

  it('follows nextToken across pages and concatenates rows', async () => {
    const calls: Array<{ sql: string; nextToken?: string; executionId?: string }> = [];
    const pages: Record<string, unknown> = {
      start: {
        columns: ['n'],
        rows: [{ n: 1 }, { n: 2 }],
        executionId: 'exec-1',
        nextToken: 'tok-1',
      },
      'tok-1': { columns: ['n'], rows: [{ n: 3 }], executionId: 'exec-1' }, // no nextToken → last page
    };
    const client = {
      athenaQuery: async (opts: { sql: string; nextToken?: string; executionId?: string }) => {
        calls.push(opts);
        return pages[opts.nextToken ?? 'start'];
      },
    };
    const result = await runAthenaQuery(client, 'SELECT n FROM t');
    expect(result.rows).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
    expect(result.truncated).toBe(false);
    // Second call echoes the token and its execution id.
    expect(calls[1]).toEqual({
      sql: 'SELECT n FROM t',
      maxRows: 100_000,
      nextToken: 'tok-1',
      executionId: 'exec-1',
    });
  });

  it('stops at MAX_ROWS and flags truncation when pages still remain', async () => {
    // Every page is full and always hands back another token → an unbounded source. Pagination
    // must stop at the MAX_ROWS backstop and report truncation rather than loop forever.
    const client = {
      athenaQuery: async () => ({
        columns: ['n'],
        rows: Array.from({ length: 1000 }, (_, i) => ({ n: i })),
        executionId: 'exec-1',
        nextToken: 'always-more',
      }),
    };
    const result = await runAthenaQuery(client, 'SELECT n FROM t');
    expect(result.rows).toHaveLength(100_000);
    expect(result.truncated).toBe(true);
  });
});
