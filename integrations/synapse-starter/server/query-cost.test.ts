import { describe, expect, it } from 'vitest';
import { costWarnings, formatCostWarnings } from './query-cost.js';

const codes = (sql: string): string[] => costWarnings(sql).map((w) => w.code);

describe('costWarnings — missing dt filter', () => {
  it('flags a partitioned fact table read with no dt predicate', () => {
    expect(
      codes('SELECT user_id, COUNT(*) FROM noon2_datamart.f_user_session GROUP BY 1'),
    ).toContain('missing-dt-filter');
  });

  it('accepts a dt predicate in any of its usual forms', () => {
    const shapes = [
      'WHERE dt >= 20260101',
      'WHERE dt BETWEEN 20260101 AND 20260201',
      'WHERE dt = 20260101',
      'WHERE dt IN (20260101, 20260102)',
    ];
    for (const where of shapes) {
      const sql = `SELECT COUNT(*) FROM noon2_datamart.f_user_session ${where}`;
      expect(codes(sql)).not.toContain('missing-dt-filter');
    }
  });

  it('is not satisfied by dt merely appearing in the SELECT list', () => {
    // The classic false negative: `dt` is selected and grouped, but nothing bounds the scan.
    expect(codes('SELECT dt, COUNT(*) FROM noon2_datamart.f_user_session GROUP BY dt')).toContain(
      'missing-dt-filter',
    );
  });

  it('leaves unpartitioned tables alone — there is no dt to filter on', () => {
    expect(codes('SELECT COUNT(*) FROM noon2_datamart.f_user_assessment')).not.toContain(
      'missing-dt-filter',
    );
  });

  it('does not confuse a table with a longer name that starts the same way', () => {
    expect(codes('SELECT COUNT(*) FROM noon2_datamart.f_user_poll_answers')).not.toContain(
      'missing-dt-filter',
    );
  });

  it('ignores a dt filter that only appears inside a comment', () => {
    const sql = 'SELECT COUNT(*) FROM noon2_datamart.f_user_session -- WHERE dt >= 20260101';
    expect(codes(sql)).toContain('missing-dt-filter');
  });
});

describe('costWarnings — select star', () => {
  it('flags SELECT * over a fact table', () => {
    expect(
      codes('SELECT * FROM noon2_datamart.f_user_session WHERE dt >= 20260101 LIMIT 100'),
    ).toContain('select-star-on-fact');
  });

  it('leaves a small dimension table alone', () => {
    expect(codes('SELECT * FROM noon2_datamart.d_course LIMIT 100')).not.toContain(
      'select-star-on-fact',
    );
  });
});

describe('costWarnings — unbounded row reads', () => {
  it('flags a row-returning read with no LIMIT', () => {
    expect(codes('SELECT course_id, course_name FROM noon2_datamart.d_course')).toContain(
      'unbounded-row-read',
    );
  });

  it('does not flag an aggregate, where no LIMIT is the correct shape', () => {
    const sql =
      'SELECT course_type, COUNT(*) AS n FROM noon2_datamart.d_course WHERE is_course_deleted = 0 GROUP BY course_type';
    expect(codes(sql)).not.toContain('unbounded-row-read');
  });

  it('does not flag a row read that carries its own LIMIT', () => {
    expect(codes('SELECT course_id FROM noon2_datamart.d_course LIMIT 500')).not.toContain(
      'unbounded-row-read',
    );
  });
});

describe('the shipped example read', () => {
  it('is clean — the template must not ship a read that trips its own guard', async () => {
    const example = await import('./queries/courses-by-type.sql.js');
    expect(costWarnings(example.sql)).toEqual([]);
  });
});

describe('formatCostWarnings', () => {
  it('returns null when every read is clean', () => {
    expect(
      formatCostWarnings([{ name: 'ok', sql: 'SELECT COUNT(*) FROM noon2_datamart.d_course' }]),
    ).toBeNull();
  });

  it('names the offending read so the message is actionable', () => {
    const out = formatCostWarnings([
      { name: 'sessions', sql: 'SELECT COUNT(*) FROM noon2_datamart.f_user_session' },
    ]);
    expect(out).toContain('sessions');
    expect(out).toContain('dt');
  });
});
