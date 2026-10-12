// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildAgentPrompt,
  buildFreshnessLabel,
  buildRequestPrompt,
  filterTables,
  GetDataTab,
  type TableProjection,
} from './GetDataTab';

const TABLES: TableProjection[] = [
  {
    key: 'd_course',
    database: 'noon2_datamart',
    table: 'd_course',
    description: 'Distinct list of all courses',
    grain: 'Course ID',
    refreshCadence: 'Every 12 hours',
    accessLevel: 'all',
    columns: [{ name: 'course_id', type: 'int', description: 'PK' }],
    exampleQueries: [],
  },
  {
    key: 'f_user_session',
    database: 'noon2_datamart',
    table: 'f_user_session',
    description: 'Attendance per live session',
    grain: 'User + Session',
    refreshCadence: 'Every 12 hours',
    accessLevel: 'all',
    columns: [{ name: 'learning_time', type: 'decimal', description: 'minutes with teacher' }],
    exampleQueries: ['SELECT user_id FROM noon2_datamart.f_user_session'],
  },
];

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () =>
        url.endsWith('/__synapse/overview')
          ? { configured: true, connection: { ok: true } }
          : TABLES,
    })),
  );
}

describe('filterTables', () => {
  it('matches on table name, description, and column names', () => {
    expect(filterTables(TABLES, 'd_course').map((t) => t.key)).toEqual(['d_course']);
    expect(filterTables(TABLES, 'learning_time').map((t) => t.key)).toEqual(['f_user_session']);
    expect(filterTables(TABLES, 'attendance').map((t) => t.key)).toEqual(['f_user_session']);
    expect(filterTables(TABLES, '')).toHaveLength(2);
    expect(filterTables(TABLES, 'nomatch')).toHaveLength(0);
  });
});

describe('buildRequestPrompt (describe-only — agent picks the table)', () => {
  it('hands off the plain-English want without naming a table', () => {
    const prompt = buildRequestPrompt('students who attended last week');
    expect(prompt).toContain('students who attended last week');
    expect(prompt).toContain('AGENTS.md');
    expect(prompt).toContain('SQL skill');
    expect(prompt).toContain('server/queries');
    expect(prompt).toContain('synapse.athenaQuery');
    // The whole point: it must NOT guess/bake a table name (no backticked identifier).
    expect(prompt).not.toContain('`');
  });

  it('falls back to a placeholder when nothing is typed', () => {
    expect(buildRequestPrompt('   ')).toContain('describe what you want');
  });
});

describe('buildAgentPrompt (deliberate table anchor)', () => {
  it('scopes the prompt to the chosen table', () => {
    const prompt = buildAgentPrompt('f_user_session', 'students who attended last week');
    expect(prompt).toContain('`f_user_session`');
    expect(prompt).toContain('students who attended last week');
    expect(prompt).toContain('AGENTS.md');
    expect(prompt).toContain('server/queries');
    expect(prompt).toContain('synapse.athenaQuery');
  });

  it('falls back to a placeholder when nothing is typed', () => {
    expect(buildAgentPrompt('d_course', '   ')).toContain('describe what you want');
  });
});

describe('<GetDataTab />', () => {
  beforeEach(stubFetch);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('starts empty and turns a plain-English want into a table-agnostic request', async () => {
    render(<GetDataTab onNavigate={vi.fn()} />);

    const textarea = (await screen.findByLabelText(
      /what data do you want to see/i,
    )) as HTMLTextAreaElement;
    expect(textarea.value).toBe('');

    // Until something is typed, the action is a disabled affordance — no request yet.
    const button = screen.getByRole('button', { name: /write my request for the builder/i });
    expect((button as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(textarea, { target: { value: 'most active students this month' } });

    const prompt = screen.getByText(/Follow AGENTS\.md/i);
    expect(prompt.textContent).toContain('most active students this month');
    expect(prompt.textContent).not.toContain('`'); // no guessed table name
  });

  it('offers a deliberate, table-scoped hand-off when you browse a specific dataset', async () => {
    render(<GetDataTab onNavigate={vi.fn()} />);

    fireEvent.click(await screen.findByText('f_user_session'));
    fireEvent.click(screen.getByRole('button', { name: /use this in my app/i }));

    const panelInput = screen.getByLabelText(/what do you want from this data/i);
    expect((panelInput as HTMLTextAreaElement).value).toBe('');

    fireEvent.change(panelInput, { target: { value: 'top 10 students by learning time' } });

    expect(screen.getByText(/paste this to the replit agent/i)).toBeTruthy();
    const scoped = screen.getByText(/Using the/i);
    expect(scoped.textContent).toContain('`f_user_session`');
    expect(scoped.textContent).toContain('top 10 students by learning time');
  });
});

describe('buildFreshnessLabel', () => {
  const base = {
    source: 'snapshot' as const,
    reason: null,
    liveVersion: null,
    liveLastModified: null,
    snapshotLastUpdated: '2026-05-04',
  };

  it('live: names version and date when meta delivered them', () => {
    expect(
      buildFreshnessLabel({
        ...base,
        source: 'live',
        snapshotLastUpdated: null,
        liveVersion: 'v2.30',
        liveLastModified: '2026-07-20',
      }),
    ).toBe(
      'Live registry v2.30 · updated 2026-07-20 — this browser matches what Citadel serves today.',
    );
  });

  it('live: still labels live when meta was unavailable', () => {
    expect(buildFreshnessLabel({ ...base, source: 'live', snapshotLastUpdated: null })).toContain(
      'Live registry —',
    );
  });

  it('not-deployed is quiet — no staleness alarm, since there is nothing to be behind', () => {
    const label = buildFreshnessLabel({ ...base, reason: 'not-deployed' });
    expect(label).toBe(
      "Built-in snapshot (dated 2026-05-04) — the live registry isn't available on this Citadel yet.",
    );
    expect(label).not.toContain('stale');
  });

  it('no-secrets and unreachable say "may be stale" with distinct causes', () => {
    expect(buildFreshnessLabel({ ...base, reason: 'no-secrets' })).toBe(
      'Snapshot (dated 2026-05-04) — may be stale. Add your Noon keys to check the live registry.',
    );
    expect(buildFreshnessLabel({ ...base, reason: 'unreachable' })).toBe(
      "Snapshot (dated 2026-05-04) — may be stale. Couldn't reach the live registry.",
    );
  });

  it('returns null on an unrecognized payload (render nothing, never break the tab)', () => {
    expect(buildFreshnessLabel({} as never)).toBeNull();
  });

  it('appends the registry stamp when the status carries one — live and snapshot alike', () => {
    expect(
      buildFreshnessLabel({
        ...base,
        source: 'live',
        snapshotLastUpdated: null,
        stamp: 'a1b2c3d4e5f6@2026-07-20',
      }),
    ).toBe(
      'Live registry — this browser matches what Citadel serves today. ' +
        'Registry stamp a1b2c3d4e5f6@2026-07-20.',
    );
    expect(buildFreshnessLabel({ ...base, reason: 'no-secrets', stamp: 'a1b2c3d4e5f6' })).toContain(
      'Registry stamp a1b2c3d4e5f6.',
    );
  });
});

describe('registry freshness banner', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders the source pill, label, and raw-registry link', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => ({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => {
          if (url.endsWith('/__synapse/overview'))
            return { configured: true, connection: { ok: true } };
          if (url.endsWith('/__synapse/registry/status')) {
            return {
              source: 'snapshot',
              reason: 'not-deployed',
              liveVersion: null,
              liveLastModified: null,
              snapshotLastUpdated: '2026-05-04',
            };
          }
          return TABLES;
        },
      })),
    );
    render(<GetDataTab onNavigate={vi.fn()} />);

    expect(await screen.findByText(/Built-in snapshot \(dated 2026-05-04\)/)).toBeTruthy();
    const link = screen.getByText('view raw registry →') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/__synapse/registry');
  });
});
