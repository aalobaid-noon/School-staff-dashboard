import { describe, expect, it } from 'vitest';
import { createVerifyRunner, type VerifyCommand } from './verify.js';

// Fake steps run tiny `node -e` programs instead of the real typecheck/lint/test chain, so the
// suite exercises the runner's contract (fail-fast, truncation, sharing) in milliseconds.
function step(name: string, program: string): VerifyCommand {
  return { name, command: process.execPath, args: ['-e', program] };
}

describe('verify runner', () => {
  it('reports all-green when every step exits 0', async () => {
    const runner = createVerifyRunner([
      step('typecheck', 'console.log("clean")'),
      step('lint', 'process.exit(0)'),
    ]);
    const result = await runner.run();
    expect(result.ok).toBe(true);
    expect(result.steps.map((s) => s.name)).toEqual(['typecheck', 'lint']);
    expect(result.steps.map((s) => s.status)).toEqual(['pass', 'pass']);
    expect(result.steps[0]?.output).toContain('clean');
    expect(result.steps[0]?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('fails fast: a red step is reported and later steps never run', async () => {
    const runner = createVerifyRunner([
      step('typecheck', 'console.error("TS2304: nope"); process.exit(2)'),
      step('lint', 'process.exit(0)'),
    ]);
    const result = await runner.run();
    expect(result.ok).toBe(false);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]).toMatchObject({ name: 'typecheck', status: 'fail' });
    expect(result.steps[0]?.output).toContain('TS2304');
  });

  it('resolves (not rejects) when a step command cannot be spawned, and calls it unavailable', async () => {
    const runner = createVerifyRunner([
      { name: 'typecheck', command: '/definitely/not/a/binary', args: [] },
    ]);
    const result = await runner.run();
    expect(result.ok).toBe(false);
    expect(result.steps[0]?.status).toBe('unavailable');
    expect(result.steps[0]?.output).toContain('could not run');
  });

  // The regression this guards: on Replit, the workspace Run installs with `--omit=dev`, so
  // `npm run typecheck` exits 127 ("tsc: command not found") on code that is perfectly clean.
  // Reporting that as a failing check points every builder at a bug that isn't there.
  it('reports a missing tool (exit 127) as unavailable, not as a failing check', async () => {
    const runner = createVerifyRunner([
      step('typecheck', 'process.exit(127)'),
      step('lint', 'process.exit(0)'),
    ]);
    const result = await runner.run();
    expect(result.steps[0]).toMatchObject({ name: 'typecheck', status: 'unavailable' });
    expect(result.steps[0]?.output).toMatch(/not installed in this environment/);
    // Not a pass either — ok stays false, so nothing claims the checks are green.
    expect(result.ok).toBe(false);
    // And unlike a failure, it doesn't stop the chain: the whole toolchain is missing together,
    // so listing every affected step is what makes the cause legible.
    expect(result.steps.map((s) => s.name)).toEqual(['typecheck', 'lint']);
    expect(result.steps[1]?.status).toBe('pass');
  });

  it('keeps only the tail of a long output', async () => {
    const runner = createVerifyRunner([
      step('test', 'for (let i = 0; i < 200; i++) console.log("line " + i)'),
    ]);
    const { steps } = await runner.run();
    expect(steps[0]?.output).toContain('earlier lines truncated');
    expect(steps[0]?.output).toContain('line 199');
    expect(steps[0]?.output).not.toContain('line 10\n');
  });

  it('shares one in-flight run across concurrent callers', async () => {
    // Each run of this step would emit a different pid; identical outputs prove a single child.
    const runner = createVerifyRunner([step('test', 'console.log("pid " + process.pid)')]);
    const [a, b] = await Promise.all([runner.run(), runner.run()]);
    expect(a.steps[0]?.output).toBe(b.steps[0]?.output);

    // A run started after the first settles is a fresh one.
    const c = await runner.run();
    expect(c.steps[0]?.output).not.toBe(a.steps[0]?.output);
  });
});
