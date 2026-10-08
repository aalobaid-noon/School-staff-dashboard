import { useEffect, useState } from 'react';

// Small shared loader for the workspace JSON endpoints. Tabs render off one of three
// states, so the loading / error / empty branches stay consistent across the console.
export type LoadState<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: T };

export function useJson<T>(url: string): LoadState<T> {
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    fetch(url)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`request failed (${res.status})`);
        }
        // In a published deployment the workspace-only /__synapse/* routes don't exist, so the
        // request falls through to the SPA catch-all and returns index.html with a 200. Guard on
        // content-type so that surfaces as a clear message instead of a JSON parse error.
        if (!res.headers.get('content-type')?.includes('application/json')) {
          throw new Error('endpoint unavailable here (the console is workspace-only)');
        }
        return res.json() as Promise<T>;
      })
      .then((data) => {
        if (!cancelled) {
          setState({ status: 'ready', data });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            message: err instanceof Error ? err.message : 'failed to load',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return state;
}
