// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildKickoffPrompt,
  buildKitUpdateMessage,
  buildStaleReadsMessage,
  HomeTab,
} from './HomeTab';
import type { VerifyState } from './useVerify';

const READY_OVERVIEW = {
  appId: 'app_demo',
  baseUrl: 'https://citadel.example',
  configured: true,
  configError: null,
  connection: { ok: true, detail: 'Last publish accepted — citadel.example is reachable.' },
};

const ALL_SET_SETUP = {
  secrets: [
    { name: 'SYNAPSE_APP_ID', set: true, required: true },
    { name: 'SYNAPSE_APP_SECRET', set: true, required: true },
    { name: 'SYNAPSE_BASE_URL', set: false, required: false },
  ],
  spec: { exists: true, filled: true },
};

const GREEN_VERIFY: VerifyState = {
  status: 'ready',
  data: { ok: true, steps: [{ name: 'typecheck', status: 'pass', durationMs: 900, output: '' }] },
};

// Up to date is the default — the kit notice only appears when a test opts in via overrides.
const UP_TO_DATE_KIT = { local: '2026.07.16', latest: '2026.07.16', updateAvailable: false };

function stubFetch(
  overrides: { overview?: unknown; setup?: unknown; kit?: unknown; registry?: unknown } = {},
): void {
  const payload = (url: string): unknown => {
    if (url.endsWith('/__synapse/overview')) return overrides.overview ?? READY_OVERVIEW;
    if (url.endsWith('/__synapse/setup')) return overrides.setup ?? ALL_SET_SETUP;
    if (url.endsWith('/__synapse/kit')) return overrides.kit ?? UP_TO_DATE_KIT;
    if (url.endsWith('/__synapse/registry/status')) return overrides.registry ?? {};
    if (url.endsWith('/__synapse/reads')) {
      return [{ name: 'courses-by-type', title: 'Active courses by type', description: 'd' }];
    }
    if (url.endsWith('/__synapse/catalog')) return { total: 5 };
    return {};
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => payload(url),
    })),
  );
}

describe('<HomeTab />', () => {
  beforeEach(() => stubFetch());
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('leads with the question and a single obvious primary action', async () => {
    const onNavigate = vi.fn();
    render(<HomeTab onNavigate={onNavigate} verify={GREEN_VERIFY} />);

    expect(screen.getByText('What do you want to build?')).toBeTruthy();
    fireEvent.click(screen.getByText('Get Noon data into my app'));
    expect(onNavigate).toHaveBeenCalledWith('get-data');
  });

  it('shows four Done checks when everything is green', async () => {
    render(<HomeTab onNavigate={vi.fn()} verify={GREEN_VERIFY} />);
    await waitFor(() => expect(screen.getAllByText('Done')).toHaveLength(4));
    expect(
      screen.getByText('Secret scan, typecheck, lint, tests, and theme tokens are all green.'),
    ).toBeTruthy();
  });

  it('goes red on a missing required secret, by NAME only, with the Secrets-pane fix', async () => {
    stubFetch({
      setup: {
        ...ALL_SET_SETUP,
        secrets: ALL_SET_SETUP.secrets.map((s) =>
          s.name === 'SYNAPSE_APP_SECRET' ? { ...s, set: false } : s,
        ),
      },
    });
    render(<HomeTab onNavigate={vi.fn()} verify={GREEN_VERIFY} />);

    expect(await screen.findByText('SYNAPSE_APP_SECRET — missing')).toBeTruthy();
    expect(screen.getByText(/Add the missing key/)).toBeTruthy();
    // The portal pointer comes from the overview's base URL.
    expect(screen.getByText('https://citadel.example/portal/replit-apps')).toBeTruthy();
  });

  it('marks the optional base URL as default, not missing', async () => {
    render(<HomeTab onNavigate={vi.fn()} verify={GREEN_VERIFY} />);
    expect(await screen.findByText('SYNAPSE_BASE_URL — default')).toBeTruthy();
    expect(screen.queryByText('SYNAPSE_BASE_URL — missing')).toBeNull();
  });

  it('goes red when not connected, with the press-Run / error-report fix', async () => {
    stubFetch({
      overview: {
        ...READY_OVERVIEW,
        connection: { ok: false, detail: 'Last publish failed: 401.' },
      },
    });
    render(<HomeTab onNavigate={vi.fn()} verify={GREEN_VERIFY} />);

    expect(await screen.findByText('Last publish failed: 401.')).toBeTruthy();
    expect(screen.getByText(/synapse-error-report/)).toBeTruthy();
  });

  it('goes red on an unfilled SPEC.md and points at the kickoff prompt', async () => {
    stubFetch({ setup: { ...ALL_SET_SETUP, spec: { exists: true, filled: false } } });
    render(<HomeTab onNavigate={vi.fn()} verify={GREEN_VERIFY} />);

    expect(await screen.findByText('SPEC.md is still the empty template.')).toBeTruthy();
    expect(
      screen.getByText('Ask your agent to interview you — copy the kickoff prompt below.'),
    ).toBeTruthy();
  });

  it('reflects a failing verify run by step name', async () => {
    render(
      <HomeTab
        onNavigate={vi.fn()}
        verify={{
          status: 'ready',
          data: {
            ok: false,
            steps: [
              { name: 'typecheck', status: 'pass', durationMs: 900, output: '' },
              { name: 'lint', status: 'fail', durationMs: 100, output: 'boom' },
            ],
          },
        }}
      />,
    );
    expect(await screen.findByText('lint failing.')).toBeTruthy();
  });

  // The regression this guards: a Replit workspace installs with `--omit=dev`, so the verify
  // tools aren't there. Check 4 used to read "Needs you: typecheck failing" on a clean clone.
  it('shows a missing toolchain as not-run rather than as a failing check', async () => {
    render(
      <HomeTab
        onNavigate={vi.fn()}
        verify={{
          status: 'ready',
          data: {
            ok: false,
            steps: [
              { name: 'secrets', status: 'pass', durationMs: 40, output: '' },
              { name: 'typecheck', status: 'unavailable', durationMs: 120, output: 'exit 127' },
              { name: 'lint', status: 'unavailable', durationMs: 90, output: 'exit 127' },
            ],
          },
        }}
      />,
    );
    expect(
      await screen.findByText(
        /typecheck, lint couldn't run in this workspace — the tools they need aren't installed here\./,
      ),
    ).toBeTruthy();
    expect(screen.getByText('Not run here')).toBeTruthy();
    expect(screen.queryByText(/failing/)).toBeNull();
    expect(screen.getByText(/Nothing to fix/)).toBeTruthy();
  });

  it('shows pending states while checks are loading or running', async () => {
    render(<HomeTab onNavigate={vi.fn()} verify={{ status: 'running' }} />);
    expect(
      screen.getByText('Running the secret scan, typecheck, lint, tests, and theme check…'),
    ).toBeTruthy();
    expect(screen.getAllByText('Checking…').length).toBeGreaterThan(0);
  });
});

describe('kit update notice', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows a quiet notice with the paste-to-agent message when the template is ahead', async () => {
    stubFetch({ kit: { local: '2026.07.16', latest: '2026.07.22', updateAvailable: true } });
    render(<HomeTab onNavigate={vi.fn()} verify={GREEN_VERIFY} />);

    expect(await screen.findByText('Kit update available (2026.07.22)')).toBeTruthy();
    expect(screen.getByText(buildKitUpdateMessage('2026.07.22'), { exact: false })).toBeTruthy();
  });

  it('renders nothing when up to date', async () => {
    stubFetch();
    render(<HomeTab onNavigate={vi.fn()} verify={GREEN_VERIFY} />);

    await screen.findByText('All keys are set.'); // wait for data so absence is meaningful
    expect(screen.queryByText(/Kit update available/)).toBeNull();
  });

  it('renders nothing when the check fails — never a red state', async () => {
    stubFetch();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    render(<HomeTab onNavigate={vi.fn()} verify={GREEN_VERIFY} />);
    expect(screen.queryByText(/Kit update available/)).toBeNull();
  });
});

describe('stale reads notice', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const STAMP = 'a1b2c3d4e5f6@2026-08-01';
  const readRow = (verdict: string, name = 'old-read', title = 'Old read') => ({
    name,
    title,
    registryVersion: 'ffffffffffff@2026-07-01',
    verdict,
  });

  it('shows a quiet notice with the paste-to-agent message for stale reads only', async () => {
    stubFetch({
      registry: { stamp: STAMP, reads: [readRow('stale'), readRow('ok', 'fresh-read', 'Fresh')] },
    });
    render(<HomeTab onNavigate={vi.fn()} verify={GREEN_VERIFY} />);

    expect(await screen.findByText('1 read predates the current data registry')).toBeTruthy();
    expect(
      screen.getByText(buildStaleReadsMessage(['old-read'], STAMP), { exact: false }),
    ).toBeTruthy();
    expect(screen.queryByText(/Fresh/)).toBeNull();
  });

  it("renders nothing for 'ok' and 'unknown' verdicts (pre-stamp formats stay silent)", async () => {
    stubFetch({
      registry: {
        stamp: STAMP,
        reads: [readRow('ok'), { ...readRow('unknown'), registryVersion: 'v2.21' }],
      },
    });
    render(<HomeTab onNavigate={vi.fn()} verify={GREEN_VERIFY} />);

    await screen.findByText('All keys are set.'); // wait for data so absence is meaningful
    expect(screen.queryByText(/predates? the current data registry/)).toBeNull();
  });

  it('renders nothing when the status check fails — never a red state', async () => {
    stubFetch();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    render(<HomeTab onNavigate={vi.fn()} verify={GREEN_VERIFY} />);
    expect(screen.queryByText(/predates? the current data registry/)).toBeNull();
  });
});

describe('buildStaleReadsMessage', () => {
  it('names the reads, the SQL skill, and the current stamp to re-stamp with', () => {
    const msg = buildStaleReadsMessage(['old-read', 'other-read'], 'a1b2c3d4e5f6@2026-08-01');
    expect(msg).toContain('old-read, other-read');
    expect(msg).toContain('noon-sql-analyst');
    expect(msg).toContain('a1b2c3d4e5f6@2026-08-01');
    expect(msg).toContain('/__synapse/registry/status');
  });
});

describe('buildKitUpdateMessage', () => {
  it('carries the version and the synapse-upgrade skill trigger phrase', () => {
    const msg = buildKitUpdateMessage('2026.07.22');
    expect(msg).toBe(
      'Kit update available (2026.07.22): tell your agent to upgrade the synapse kit',
    );
  });
});

describe('buildKickoffPrompt', () => {
  it('routes the agent through the whole first-build contract', () => {
    const prompt = buildKickoffPrompt();
    expect(prompt).toContain('<describe what you want in plain English>');
    expect(prompt).toContain('read AGENTS.md in full');
    expect(prompt).toContain('.agents/skills/synapse-plan-first/SKILL.md');
    expect(prompt).toContain('write SPEC.md');
    expect(prompt).toContain('noon-sql-analyst');
    expect(prompt).toContain('server/queries/<name>.sql.ts');
    expect(prompt).toContain('never a raw fetch');
    expect(prompt).toContain('npm run verify');
  });
});
