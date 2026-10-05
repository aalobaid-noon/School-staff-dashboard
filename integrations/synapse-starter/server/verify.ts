import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Runs the repo's verify steps (the same chain as `npm run verify`) as child processes and
// reports structured results for the console's verify chip. Failures are data, not errors:
// a red step comes back as `status: 'fail'` with its output, and run() never rejects.
//
// A step whose TOOL is absent is not a failure. Replit's workspace Run is
// `npm install --omit=dev`, which skips typescript, biome and vitest — so in a workspace
// `npm run typecheck` dies with "tsc: command not found" on code that is perfectly clean.
// Reporting that red points every builder at a problem that isn't in their app. It reports
// as 'unavailable' instead, and the chain keeps going: the deployment build installs the dev
// deps in full, so real failures are still caught where shipping depends on them.

/** `pass` ran and exited 0 · `fail` ran and exited non-zero · `unavailable` couldn't run here. */
export type VerifyStepStatus = 'pass' | 'fail' | 'unavailable';

export interface VerifyStep {
  name: string;
  status: VerifyStepStatus;
  durationMs: number;
  /** Combined stdout+stderr, truncated to roughly the last 50 lines. */
  output: string;
}

export interface VerifyResult {
  /** Every step ran AND passed — an unavailable step is not a pass. */
  ok: boolean;
  steps: VerifyStep[];
}

export interface VerifyCommand {
  name: string;
  command: string;
  args: string[];
}

const OUTPUT_TAIL_LINES = 50;
// The shell's "command not found". tsc/biome/vitest all exit 0/1/2, so 127 out of `npm run <x>`
// means the tool behind the script is missing — an environment fact, not a broken check.
const EXIT_COMMAND_NOT_FOUND = 127;
// Keeps a wedged child from pinning the in-flight lock (and the console chip) forever.
const STEP_TIMEOUT_MS = 5 * 60_000;

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Mirrors package.json's `verify` script: same steps, same order, same fail-fast. The secret
// scan goes first — it's the fastest step and the most urgent failure.
//
// One deliberate omission: `check:urls`. It fetches every knowledge URL sequentially with a 3s
// timeout, so it costs ~4s online and up to ~45s offline — too slow for something that runs on
// every console load — and by its own design it is inert in a clone (it guards the template's
// own docs, and never hard-fails on a network problem). `npm run verify` still runs it.
const VERIFY_COMMANDS: VerifyCommand[] = [
  { name: 'secrets', command: 'npm', args: ['run', 'secrets'] },
  { name: 'typecheck', command: 'npm', args: ['run', 'typecheck'] },
  { name: 'lint', command: 'npm', args: ['run', 'lint'] },
  { name: 'test', command: 'npm', args: ['run', 'test'] },
  { name: 'check:theme', command: 'npm', args: ['run', 'check:theme'] },
];

function truncateOutput(raw: string): string {
  const lines = raw.replace(/\n$/, '').split('\n');
  if (lines.length <= OUTPUT_TAIL_LINES) {
    return lines.join('\n');
  }
  return [`… (${lines.length - OUTPUT_TAIL_LINES} earlier lines truncated)`]
    .concat(lines.slice(-OUTPUT_TAIL_LINES))
    .join('\n');
}

function runStep(step: VerifyCommand, cwd: string): Promise<VerifyStep> {
  const startedAt = Date.now();
  return new Promise((resolveStep) => {
    let output = '';
    const append = (chunk: unknown): void => {
      output += String(chunk);
      // Cap the buffer so a chatty step can't grow memory unboundedly; only the tail is kept.
      if (output.length > 200_000) {
        output = output.slice(-100_000);
      }
    };
    const settle = (status: VerifyStepStatus, note?: string): void => {
      resolveStep({
        name: step.name,
        status,
        durationMs: Date.now() - startedAt,
        output: truncateOutput(note ? `${output}\n${note}` : output),
      });
    };

    const child = spawn(step.command, step.args, { cwd, timeout: STEP_TIMEOUT_MS });
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    // 'error' means the command itself never started (typically ENOENT — not installed). That's
    // the same class as exit 127, and never a rejection.
    child.on('error', (err) =>
      settle('unavailable', `could not run ${step.command}: ${err.message}`),
    );
    child.on('close', (code, signal) => {
      if (signal) {
        settle('fail', `killed by ${signal} (step timed out after ${STEP_TIMEOUT_MS / 1000}s?)`);
        return;
      }
      if (code === EXIT_COMMAND_NOT_FOUND) {
        settle(
          'unavailable',
          `\`${step.command} ${step.args.join(' ')}\` exited ${EXIT_COMMAND_NOT_FOUND} — the tool this step runs is not installed in this environment.`,
        );
        return;
      }
      settle(code === 0 ? 'pass' : 'fail');
    });
  });
}

async function runAll(commands: VerifyCommand[], cwd: string): Promise<VerifyResult> {
  const steps: VerifyStep[] = [];
  for (const command of commands) {
    const step = await runStep(command, cwd);
    steps.push(step);
    if (step.status === 'fail') {
      break; // fail fast, like the npm script — later steps don't run
    }
    // An unavailable step does NOT stop the chain: when the dev toolchain is absent every step
    // that needs it is absent, and listing all of them is what makes the cause legible.
  }
  return { ok: steps.every((s) => s.status === 'pass'), steps };
}

// One runner per process. Concurrent requests (say, two console tabs loading at once) share the
// in-flight run instead of stacking `tsc` + `vitest` processes: callers awaiting run() while one
// is executing all receive that run's result.
export function createVerifyRunner(
  commands: VerifyCommand[] = VERIFY_COMMANDS,
  cwd: string = repoRoot,
): { run: () => Promise<VerifyResult> } {
  let inFlight: Promise<VerifyResult> | null = null;
  return {
    run: () => {
      if (!inFlight) {
        inFlight = runAll(commands, cwd).finally(() => {
          inFlight = null;
        });
      }
      return inFlight;
    },
  };
}

export const verifyRunner = createVerifyRunner();
