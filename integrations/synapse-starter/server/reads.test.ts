import { describe, expect, it } from 'vitest';
import type { AthenaQueryClient, AthenaRows } from './athena.js';
import { createQueryCache } from './query-cache.js';
import { readContext, runRead } from './reads.js';

const EXAMPLE = 'courses-by-type';

function mockClient(rows: Record<string, unknown>[]) {
  let calls = 0;
  const client: AthenaQueryClient = {
    athenaQuery: async () => {
      calls += 1;
      return { columns: Object.keys(rows[0] ?? {}), rows };
    },
  };
  return { client, calls: () => calls };
}

describe('runRead', () => {
  it('returns null for an unknown read name (route answers 404)', async () => {
    expect(await runRead(mockClient([]).client, 'does-not-exist')).toBeNull();
  });

  it('returns an empty, configured:false result when the client is null (never throws)', async () => {
    const result = await runRead(null, EXAMPLE);
    expect(result).not.toBeNull();
    expect(result?.configured).toBe(false);
    expect(result?.rows).toEqual([]);
    expect(result?.dataAsOf).toBeNull();
    expect(result?.error).toBeNull();
    // baked metadata still surfaces so the UI can show the SQL
    expect(result?.sql).toContain('FROM noon2_datamart.d_course');
  });

  it('runs the baked SQL via the SDK and returns rows with a freshness stamp', async () => {
    const { client, calls } = mockClient([
      { course_type: 'SCHOOL', course_count: 12 },
      { course_type: 'O2O', course_count: 5 },
    ]);
    const cache = createQueryCache<AthenaRows>({
      now: () => 1_700_000_000_000,
    });

    const result = await runRead(client, EXAMPLE, { cache });
    expect(calls()).toBe(1);
    expect(result?.configured).toBe(true);
    expect(result?.cached).toBe(false);
    expect(result?.columns).toEqual(['course_type', 'course_count']);
    expect(result?.rows).toHaveLength(2);
    expect(result?.dataAsOf).toBe(new Date(1_700_000_000_000).toISOString());
  });

  it('serves the second call from cache (the SDK is hit once)', async () => {
    const { client, calls } = mockClient([{ course_type: 'SCHOOL', course_count: 1 }]);
    const cache = createQueryCache<AthenaRows>({
      now: () => 0,
    });

    const first = await runRead(client, EXAMPLE, { cache });
    const second = await runRead(client, EXAMPLE, { cache });
    expect(calls()).toBe(1);
    expect(first?.cached).toBe(false);
    expect(second?.cached).toBe(true);
  });

  it('passes the read context to athenaQuery for a registered read', async () => {
    const seen: Array<{ context?: string }> = [];
    const client: AthenaQueryClient = {
      athenaQuery: async (opts) => {
        seen.push(opts);
        return { columns: [], rows: [] };
      },
    };
    await runRead(client, EXAMPLE, { cache: createQueryCache() });
    expect(seen).toHaveLength(1);
    // The ledger label: "name: title" (fits the 120-char budget for the shipped example).
    expect(seen[0]?.context).toBe('courses-by-type: Active courses by type');
  });

  it('surfaces a read failure as an error field, not a throw/500', async () => {
    const failing: AthenaQueryClient = {
      athenaQuery: async () => {
        throw new Error('staging unreachable');
      },
    };
    const result = await runRead(failing, EXAMPLE, { cache: createQueryCache() });
    expect(result?.configured).toBe(true);
    expect(result?.error).toBe('staging unreachable');
    expect(result?.rows).toEqual([]);
  });
});

describe('readContext', () => {
  it('labels with "name: title" while it fits, falling back to the stable name', () => {
    expect(readContext({ name: 'my-read', title: 'A short title' })).toBe('my-read: A short title');
    expect(readContext({ name: 'my-read', title: 'x'.repeat(200) })).toBe('my-read');
  });
});
