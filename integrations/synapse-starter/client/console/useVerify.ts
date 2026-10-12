import { useCallback, useEffect, useRef, useState } from 'react';

// One shared verify run per console load, consumed by BOTH the header chip and the Home tab's
// checklist. Lifted out of VerifyChip so mounting the Home tab doesn't kick off a second
// typecheck/lint/test run — ConsoleApp calls this once and passes the state down. It can't use
// useJson (that loader is one-shot per URL and this needs manual re-runs), but it keeps the
// same status-shape and content-type guard.

// Mirrors server/verify.ts VerifyResult (served by /__synapse/verify). 'unavailable' is a step
// whose tool isn't installed here (Replit's workspace Run omits the dev deps) — neutral, not red.
export type VerifyStepStatus = 'pass' | 'fail' | 'unavailable';
export interface VerifyStep {
  name: string;
  status: VerifyStepStatus;
  durationMs: number;
  output: string;
}
export interface VerifyResult {
  ok: boolean;
  steps: VerifyStep[];
}

export type VerifyState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: VerifyResult };

export function useVerify(): { state: VerifyState; run: () => void } {
  const [state, setState] = useState<VerifyState>({ status: 'idle' });
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const run = useCallback(() => {
    setState({ status: 'running' });
    fetch('/__synapse/verify')
      .then((res) => {
        if (!res.ok) {
          throw new Error(`request failed (${res.status})`);
        }
        if (!res.headers.get('content-type')?.includes('application/json')) {
          throw new Error('endpoint unavailable here (the console is workspace-only)');
        }
        return res.json() as Promise<VerifyResult>;
      })
      .then((data) => {
        if (alive.current) {
          setState({ status: 'ready', data });
        }
      })
      .catch((err: unknown) => {
        if (alive.current) {
          setState({
            status: 'error',
            message: err instanceof Error ? err.message : 'failed to run checks',
          });
        }
      });
  }, []);

  // The checks run on console load, so the chip and checklist are meaningful before any click.
  useEffect(() => {
    run();
  }, [run]);

  return { state, run };
}
