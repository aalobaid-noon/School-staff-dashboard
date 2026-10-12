import { describe, expect, it } from 'vitest';
import { buildCatalog } from './catalog.js';

describe('buildCatalog', () => {
  it('groups dotted event types by namespace and counts the total', () => {
    const catalog = buildCatalog([
      'task.created',
      'task.assigned',
      'sanad_ticket.closed',
      'app_booted',
      'campus_created',
    ]);

    expect(catalog.total).toBe(5);
    const byNs = Object.fromEntries(catalog.groups.map((g) => [g.namespace, g.eventTypes]));
    expect(byNs.task).toEqual(['task.assigned', 'task.created']); // sorted within group
    expect(byNs.sanad_ticket).toEqual(['sanad_ticket.closed']);
    expect(byNs['(core)']).toEqual(['app_booted', 'campus_created']);
  });

  it('sorts groups by namespace and handles an empty catalog', () => {
    expect(buildCatalog([])).toEqual({ total: 0, groups: [] });

    const namespaces = buildCatalog(['task.x', 'app_booted', 'sanad_ticket.y']).groups.map(
      (g) => g.namespace,
    );
    expect(namespaces).toEqual(['(core)', 'sanad_ticket', 'task']);
  });
});
