import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from './index.js';
import { buildSetup, readSpecText, SPEC_UNFILLED_MARKER } from './setup.js';

const FILLED_SPEC = [
  'status: approved 2026-07-14',
  '',
  '# SPEC.md — what this app is',
  '',
  // The prose keeps the marker phrase even after filling — only line 1 decides.
  `While the line above says \`${SPEC_UNFILLED_MARKER}\`, no feature work starts.`,
].join('\n');

const UNFILLED_SPEC = `status: ${SPEC_UNFILLED_MARKER}\n\n# SPEC.md — what this app is\n`;

describe('buildSetup', () => {
  it('reports secret presence by name only — never a value', () => {
    // Built at runtime (not a quoted literal) so the repo's own secret scan — the "secrets"
    // step of npm run verify — can't match this tracked file.
    const fakeSecret = ['shh', 'very', 'secret'].join('-');
    const env = {
      SYNAPSE_APP_ID: 'app_super_secret_id',
      SYNAPSE_APP_SECRET: fakeSecret,
    };
    const setup = buildSetup({ env, specText: null });

    expect(setup.secrets).toEqual([
      { name: 'SYNAPSE_APP_ID', set: true, required: true },
      { name: 'SYNAPSE_APP_SECRET', set: true, required: true },
      { name: 'SYNAPSE_BASE_URL', set: false, required: false },
    ]);

    // The projection must never carry a secret value, however it's serialized.
    const serialized = JSON.stringify(setup);
    expect(serialized).not.toContain('app_super_secret_id');
    expect(serialized).not.toContain(fakeSecret);
  });

  it('treats an empty-string env var as not set', () => {
    const setup = buildSetup({ env: { SYNAPSE_APP_ID: '' }, specText: null });
    expect(setup.secrets.find((s) => s.name === 'SYNAPSE_APP_ID')?.set).toBe(false);
  });

  it('reports a missing SPEC.md as not existing and not filled', () => {
    expect(buildSetup({ env: {}, specText: null }).spec).toEqual({ exists: false, filled: false });
  });

  it('reports the template spec (marker on line 1) as unfilled', () => {
    expect(buildSetup({ env: {}, specText: UNFILLED_SPEC }).spec).toEqual({
      exists: true,
      filled: false,
    });
  });

  it('reports an approved spec as filled even though the prose mentions the marker', () => {
    expect(buildSetup({ env: {}, specText: FILLED_SPEC }).spec).toEqual({
      exists: true,
      filled: true,
    });
  });
});

describe('GET /__synapse/setup', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('serves presence-only JSON in the workspace — the value never appears in the body', async () => {
    vi.stubEnv('SYNAPSE_APP_ID', 'canary-value-that-must-not-leak');
    const app = buildApp({ isReplitDeployment: false });
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    const { port } = server.address() as { port: number };
    try {
      const res = await fetch(`http://127.0.0.1:${port}/__synapse/setup`);
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).not.toContain('canary-value-that-must-not-leak');
      const parsed = JSON.parse(body) as { secrets: Array<{ name: string; set: boolean }> };
      expect(parsed.secrets.find((s) => s.name === 'SYNAPSE_APP_ID')?.set).toBe(true);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe('readSpecText', () => {
  let dir: string | null = null;
  afterEach(() => {
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
      dir = null;
    }
  });

  it('reads an existing file and returns null for a missing one', () => {
    dir = mkdtempSync(join(tmpdir(), 'setup-test-'));
    const path = join(dir, 'SPEC.md');
    writeFileSync(path, UNFILLED_SPEC);

    expect(readSpecText(path)).toBe(UNFILLED_SPEC);
    expect(readSpecText(join(dir, 'nope.md'))).toBeNull();
  });
});
