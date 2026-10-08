import { useEffect, useState } from 'react';

// One static bundle is served at `/` in BOTH the workspace (the builder console) and a published
// Replit deployment (the shipped app). The client can't read REPLIT_DEPLOYMENT, so it derives its
// mode from the server's own behaviour: the `/__synapse/*` endpoints are mounted ONLY when
// REPLIT_DEPLOYMENT is unset (see server/index.ts). We probe one of them — a JSON response means
// we're in the workspace and render the console; anything else (the SPA catch-all serves
// index.html, or the request errors) means we're published and render the app. The client's
// decision can't disagree with the server, because it's read straight off the server's response.
export type SynapseMode = 'probing' | 'workspace' | 'published';

// Escape hatch: `?surface=app` / `?surface=console` forces a mode so the builder can preview the
// shipped app locally (where the endpoints DO exist) without deploying.
function forcedMode(): Exclude<SynapseMode, 'probing'> | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const surface = new URLSearchParams(window.location.search).get('surface');
  if (surface === 'app') {
    return 'published';
  }
  if (surface === 'console') {
    return 'workspace';
  }
  return null;
}

export function useSynapseMode(): SynapseMode {
  const [mode, setMode] = useState<SynapseMode>(() => forcedMode() ?? 'probing');

  useEffect(() => {
    if (mode !== 'probing') {
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    // A hung probe must not strand end users on the blank splash forever — time out and fall back
    // to the shipped app (same as any other ambiguous outcome).
    const timeout = setTimeout(() => controller.abort(), 3000);
    fetch('/__synapse/overview', { signal: controller.signal })
      .then((res) => {
        // Mirror the content-type guard in useJson.ts: only a real JSON response from the
        // workspace-only endpoint means we're in the console.
        const isJson =
          res.ok && Boolean(res.headers.get('content-type')?.includes('application/json'));
        if (!cancelled) {
          setMode(isJson ? 'workspace' : 'published');
        }
      })
      .catch(() => {
        // Network error or timeout — default to the shipped app; never leak console chrome
        // to end users.
        if (!cancelled) {
          setMode('published');
        }
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [mode]);

  return mode;
}
