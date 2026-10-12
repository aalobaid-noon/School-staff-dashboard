// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ViewData } from '../useView';
import { AppShell } from './AppShell';
import { getPageForPath, listAppPages } from './pages';

// jsonResponse mimics the server's JSON endpoints: JSON body + a JSON content-type the probes
// check for.
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// What every unmounted route returns through the SPA catch-all (e.g. /__synapse/* in a published
// deployment): index.html with a 200.
function htmlResponse(): Response {
  return new Response('<!doctype html>', {
    status: 200,
    headers: { 'content-type': 'text/html' },
  });
}

// Route fetches by pathname; anything unstubbed falls through to the catch-all, exactly like the
// real server.
function stubFetchRoutes(routes: Record<string, () => Response>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const bare = url.startsWith('http') ? new URL(url).pathname : url;
      const path = bare.split('?')[0] ?? bare;
      return routes[path]?.() ?? htmlResponse();
    }),
  );
}

const EXAMPLE_VIEW: ViewData = {
  name: 'courses-by-type',
  title: 'Active courses by type',
  description: 'Example view',
  columns: ['course_type', 'total'],
  rows: [{ course_type: 'k12', total: 3 }],
  truncated: false,
  dataAsOf: null,
  configured: true,
  error: null,
};

const OVERVIEW = {
  appId: 'app_123',
  baseUrl: 'https://citadel.example',
  configured: true,
  configError: null,
  connection: { ok: true, detail: 'Last publish accepted (eventId=42).' },
};

describe('app page registry', () => {
  it('resolves the home page and falls back for unknown paths', () => {
    expect(getPageForPath('/')?.title).toBe('Home');
    expect(getPageForPath('/does-not-exist')?.title).toBe('Home');
    expect(listAppPages().length).toBeGreaterThan(0);
  });

  it('registers /synapse but keeps it out of the primary nav', () => {
    const synapse = getPageForPath('/synapse');
    expect(synapse?.title).toBe('Synapse');
    expect(synapse?.nav).toBe(false);
    expect(
      listAppPages()
        .filter((p) => p.nav)
        .map((p) => p.path),
    ).toEqual(['/']);
  });
});

describe('<AppShell /> session gate', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders the login screen when the probe is unauthenticated (401)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(401, { error: 'Not signed in' })),
    );
    render(<AppShell />);
    // Heading and the sign-in link both carry the label; the link is the part that must exist.
    const signIn = await screen.findAllByText('Sign in with Noon');
    expect(signIn.some((el) => el.closest('a')?.getAttribute('href') === '/auth/login')).toBe(true);
  });

  it('renders the shipped app when the probe is authenticated', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(200, { email: 'dana@noonacademy.com', name: 'Dana' })),
    );
    render(<AppShell />);
    expect(await screen.findByText("This app hasn't been built yet")).toBeTruthy();
  });

  it('does not wall the app when the gate is absent (non-JSON catch-all response)', async () => {
    // Local / not-deployed: /api/me falls through to the SPA catch-all and returns HTML.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => htmlResponse()),
    );
    render(<AppShell />);
    expect(await screen.findByText("This app hasn't been built yet")).toBeTruthy();
  });
});

describe('home page pre-build empty state', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows the two next steps and the footer link to /synapse', async () => {
    stubFetchRoutes({ '/api/me': () => jsonResponse(200, { email: 'dana@noonacademy.com' }) });
    render(<AppShell />);
    expect(await screen.findByText("This app hasn't been built yet")).toBeTruthy();
    // The two next steps: console checklist, kickoff prompt.
    expect(screen.getByText('Synapse console')).toBeTruthy();
    expect(screen.getByText('kickoff prompt')).toBeTruthy();
    // Synapse's only chrome in the shipped app: the small footer link, not a nav entry.
    expect(screen.getByRole('button', { name: 'Synapse' })).toBeTruthy();
    expect(screen.queryByRole('navigation')).toBeNull();
  });
});

describe('/synapse utility page', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    window.history.pushState(null, '', '/');
  });

  it('renders the example views under the scaffolding heading', async () => {
    window.history.pushState(null, '', '/synapse');
    stubFetchRoutes({
      '/api/me': () => jsonResponse(200, { email: 'dana@noonacademy.com' }),
      '/__synapse/overview': () => jsonResponse(200, OVERVIEW),
      '/api/views/courses-by-type': () => jsonResponse(200, EXAMPLE_VIEW),
    });
    render(<AppShell />);
    expect(await screen.findByText('Example views — Synapse scaffolding')).toBeTruthy();
    expect(await screen.findByText('Active courses by type')).toBeTruthy();
    expect(screen.getByText('k12')).toBeTruthy();
  });

  it('shows connection status and the console link in the workspace', async () => {
    window.history.pushState(null, '', '/synapse');
    stubFetchRoutes({
      '/api/me': () => jsonResponse(200, { email: 'dana@noonacademy.com' }),
      '/__synapse/overview': () => jsonResponse(200, OVERVIEW),
      '/api/views/courses-by-type': () => jsonResponse(200, EXAMPLE_VIEW),
    });
    render(<AppShell />);
    expect(await screen.findByText('Connected')).toBeTruthy();
    expect(screen.getByText('app_123')).toBeTruthy();
    const consoleLink = screen.getByRole('link', { name: 'Open the builder console' });
    expect(consoleLink.getAttribute('href')).toBe('/?surface=console');
  });

  it('hides the builder-only panel in a published deployment', async () => {
    // Published: /__synapse/overview isn't mounted, so it falls through to the HTML catch-all.
    window.history.pushState(null, '', '/synapse');
    stubFetchRoutes({
      '/api/me': () => jsonResponse(200, { email: 'dana@noonacademy.com' }),
      '/api/views/courses-by-type': () => jsonResponse(200, EXAMPLE_VIEW),
    });
    render(<AppShell />);
    expect(await screen.findByText('Published deployment')).toBeTruthy();
    expect(await screen.findByText('Example views — Synapse scaffolding')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Open the builder console' })).toBeNull();
    expect(screen.queryByText('Connected')).toBeNull();
  });
});

// The mode split in client/main.tsx (workspace console vs shipped app) and client/console/* are
// intentionally untouched by this gate: AppShell only renders in 'published' mode, so the console
// stays unauthenticated. useSynapseMode's own tests cover that split.
