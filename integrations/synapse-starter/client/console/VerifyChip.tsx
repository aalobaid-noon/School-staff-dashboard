import { useState } from 'react';
import { Pill } from '../ui';
import type { VerifyState, VerifyStep } from './useVerify';

// The console header's persistent "do the checks pass?" chip. Presentational: the verify state
// lives in ConsoleApp (via useVerify) so the Home tab's checklist shares the same run instead
// of kicking off its own. The ↻ button re-runs on demand; when there's something to explain —
// a red step, or a step whose tool isn't installed here — clicking the chip opens the detail.

function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

const STEP_PILL: Record<
  VerifyStep['status'],
  { tone: 'good' | 'error' | 'neutral'; label: string }
> = {
  pass: { tone: 'good', label: 'pass' },
  fail: { tone: 'error', label: 'fail' },
  unavailable: { tone: 'neutral', label: 'not run' },
};

export function VerifyChip({ state, onRerun }: { state: VerifyState; onRerun: () => void }) {
  const [open, setOpen] = useState(false);

  const running = state.status === 'running' || state.status === 'idle';
  const steps = state.status === 'ready' ? state.data.steps : [];
  const failing = steps.filter((s) => s.status === 'fail');
  // Not red: the tool behind these steps isn't installed in this environment. Saying "failing"
  // would send the builder hunting for a bug in code that is fine.
  const unavailable = steps.filter((s) => s.status === 'unavailable');

  return (
    <div className="relative flex shrink-0 items-center gap-1.5">
      {running && <Pill tone="neutral">Checking…</Pill>}
      {state.status === 'error' && (
        <Pill tone="warn" title={state.message}>
          Couldn't check
        </Pill>
      )}
      {state.status === 'ready' &&
        (state.data.ok ? (
          <Pill tone="good">All checks pass</Pill>
        ) : failing.length > 0 ? (
          // Red is a button: clicking reveals which step failed and its output.
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40"
          >
            {failing.length} failing
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
          >
            {unavailable.length} not run here
          </button>
        ))}
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          onRerun();
        }}
        disabled={running}
        title="Re-run checks (secret scan, typecheck, lint, tests, theme tokens)"
        aria-label="Re-run checks"
        className="rounded-md px-1.5 py-0.5 text-sm text-slate-400 transition-colors hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 disabled:cursor-not-allowed disabled:opacity-40"
      >
        ↻
      </button>

      {open && state.status === 'ready' && !state.data.ok && (
        <div className="absolute right-0 top-full z-10 mt-2 w-[28rem] max-w-[85vw] rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-lg">
          <ul className="space-y-2">
            {steps.map((step) => {
              const pill = STEP_PILL[step.status];
              return (
                <li key={step.name} className="min-w-0 space-y-2">
                  <span className="flex items-center gap-2 text-sm text-slate-700">
                    <Pill tone={pill.tone}>{pill.label}</Pill>
                    <span className="font-medium">{step.name}</span>
                    <span className="text-xs text-slate-400">
                      {formatDuration(step.durationMs)}
                    </span>
                  </span>
                  {step.status !== 'pass' && (
                    <pre className="max-h-64 min-w-0 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                      {step.output || '(no output)'}
                    </pre>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-slate-400">
            {failing.length > 0
              ? "Later steps don't run after a failure — fix the red step and re-run."
              : 'These run on the deployment build, where the full toolchain is installed. Run `npm run verify` in the Shell to run them here.'}
          </p>
        </div>
      )}
    </div>
  );
}
