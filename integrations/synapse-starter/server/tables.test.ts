import { describe, expect, it } from 'vitest';
import type { AthenaTableMeta } from './citadel-schema.js';
import { projectTable, projectTables } from './tables.js';

const sample: AthenaTableMeta = {
  key: 'd_course',
  database: 'noon2_datamart',
  table: 'd_course',
  description: 'Distinct list of all courses.',
  grain: 'Course ID',
  partition: null,
  refreshCadence: 'Every 12 hours',
  accessLevel: 'all',
  scopeColumn: null,
  scopeType: null,
  columns: [
    { name: 'course_id', type: 'int', description: 'PK' },
    {
      name: 'course_type',
      type: 'varchar',
      description: 'Course type',
      enumValues: ['O2O', 'MARKETPLACE', 'SCHOOL'],
    },
  ],
  exampleQueries: ['SELECT 1'],
};

describe('projectTable', () => {
  it('projects the registry fields the Get data tab needs', () => {
    expect(projectTable(sample)).toEqual({
      key: 'd_course',
      database: 'noon2_datamart',
      table: 'd_course',
      description: 'Distinct list of all courses.',
      grain: 'Course ID',
      refreshCadence: 'Every 12 hours',
      accessLevel: 'all',
      columns: [
        { name: 'course_id', type: 'int', description: 'PK' },
        {
          name: 'course_type',
          type: 'varchar',
          description: 'Course type',
          enumValues: ['O2O', 'MARKETPLACE', 'SCHOOL'],
        },
      ],
      exampleQueries: ['SELECT 1'],
    });
  });

  it('does not leak scope/partition internals into the projection', () => {
    const projected = projectTable(sample) as unknown as Record<string, unknown>;
    expect(projected.scopeColumn).toBeUndefined();
    expect(projected.scopeType).toBeUndefined();
    expect(projected.partition).toBeUndefined();
  });

  it('omits enumValues when absent and defaults exampleQueries to []', () => {
    const noEnums: AthenaTableMeta = {
      ...sample,
      columns: [{ name: 'x', type: 'int', description: 'd' }],
      exampleQueries: undefined,
    };
    const projected = projectTable(noEnums);
    const [firstCol] = projected.columns;
    expect(firstCol?.enumValues).toBeUndefined();
    expect(projected.exampleQueries).toEqual([]);
  });
});

describe('projectTables', () => {
  it('projects the whole bundled registry, keyed list intact', () => {
    const all = projectTables();
    expect(all.length).toBeGreaterThan(20);
    const course = all.find((t) => t.key === 'd_course');
    expect(course?.database).toBe('noon2_datamart');
    expect(course?.columns.length).toBeGreaterThan(0);
  });
});
