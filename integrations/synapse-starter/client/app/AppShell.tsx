import { useEffect, useState } from 'react';
import { APP_NAME } from './config';
import { LoginScreen } from './LoginScreen';
import { type AppPage, getPageForPath, listAppPages } from './pages';

// The shipped product's chrome — what end users see at `/` in a published deployment. Deliberately
// NOT the console chrome: this is the app the builder is making, so keep it clean. Its look comes
// entirely from the tokens in ./theme.css (bg-surface, text-ink, rounded-control, …) — restyle the
// app by editing that file, never by hardcoding colors here.

type AuthState = 'probing' | 'authenticated' | 'unauthenticated';

// Probe the server's session gate, mirroring useSynapseMode's philosophy: the client can't read
// REPLIT_DEPLOYMENT, so it infers auth from the server's own behaviour.
//   200 JSON {email}  -> signed in                        -> render the app
//   401               -> gate is on and we're signed out  -> render the login screen
//   anything else     -> gate isn't mounted here (local / not deployed): the request fell through
//                        to the SPA catch-all and returned index.html -> no wall, render the app
function useEndUserAuth(): AuthState {
  const [state, setState] = useState<AuthState>('probing');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/me')
      .then((res) => {
        if (cancelled) {
          return;
        }
        const isJson = Boolean(res.headers.get('content-type')?.includes('application/json'));
        if (res.ok && isJson) {
          setState('authenticated');
        } else if (res.status === 401) {
          setState('unauthenticated');
        } else {
          setState('authenticated');
        }
      })
      .catch(() => {
        // Ambiguous (network error) — don't wall a working app behind a failed probe.
        if (!cancelled) {
          setState('authenticated');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

// Hand-rolled, dependency-free routing: resolve the current path against the page registry, and
// navigate with history.pushState so end users get real, bookmarkable URLs. The server's SPA
// catch-all already serves index.html for any non-`/__synapse` path, so deep links work on reload.
// The query string is preserved across navigations so the workspace preview's `?surface=app`
// escape hatch survives a page change.
function useAppPath(): [string, (path: string) => void] {
  const [path, setPath] = useState(() =>
    typeof window === 'undefined' ? '/' : window.location.pathname,
  );

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = (next: string) => {
    if (next === window.location.pathname) {
      return;
    }
    window.history.pushState(null, '', next + window.location.search);
    setPath(next);
  };

  return [path, navigate];
}

export function AppShell() {
  const auth = useEndUserAuth();
  const [path, navigate] = useAppPath();

  // Hold on a brand-neutral splash until the probe settles, so end users never glimpse the app
  // chrome before the login screen (or vice versa).
  if (auth === 'probing') {
    return <div className="min-h-screen bg-surface" aria-hidden />;
  }
  if (auth === 'unauthenticated') {
    return <LoginScreen />;
  }

  const page = getPageForPath(path);
  const navPages = listAppPages().filter((p) => p.nav);

  return (
    <div className="flex min-h-screen flex-col bg-surface font-app text-body text-ink">
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-gutter py-4">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-lg font-semibold text-ink"
          >
            {APP_NAME}
          </button>
          {/* One page needs no nav; it appears once the app grows past the home page. */}
          {navPages.length > 1 && <AppNav pages={navPages} current={path} onNavigate={navigate} />}
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-gutter py-stack">
        {page ? <page.Page /> : <NotFound />}
      </main>

      {/* Synapse's one piece of chrome in the shipped app: a quiet corner link to the /synapse
          utility page (scaffolding examples + status). Never part of the primary nav. */}
      <footer className="mx-auto flex w-full max-w-5xl justify-end px-gutter py-4">
        <button
          type="button"
          onClick={() => navigate('/synapse')}
          className="inline-flex items-center gap-1 text-caption text-ink-faint transition-colors hover:text-ink-muted"
        >
          <span aria-hidden>⚙</span>
          Synapse
        </button>
      </footer>
    </div>
  );
}

function AppNav({
  pages,
  current,
  onNavigate,
}: {
  pages: AppPage[];
  current: string;
  onNavigate: (path: string) => void;
}) {
  return (
    <nav className="flex gap-1" aria-label="App pages">
      {pages.map((p) => (
        <button
          key={p.path}
          type="button"
          onClick={() => onNavigate(p.path)}
          aria-current={current === p.path ? 'page' : undefined}
          className={`rounded-control px-3 py-1.5 text-body font-medium transition-colors ${
            current === p.path ? 'bg-primary/10 text-primary' : 'text-ink-muted hover:text-ink'
          }`}
        >
          {p.title}
        </button>
      ))}
    </nav>
  );
}

function NotFound() {
  return (
    <div className="rounded-control border border-dashed border-line px-4 py-10 text-center text-body text-ink-muted">
      This page doesn't exist yet.
    </div>
  );
}
