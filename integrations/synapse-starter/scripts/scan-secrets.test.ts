import { describe, expect, it } from 'vitest';
import { type Finding, scanFiles, scanText } from './scan-secrets.js';

// Every fixture is BUILT AT RUNTIME (joins, repeats) — never written as a literal — so this
// tracked file can't trip the repo's own secret scan.

const RPL_TOKEN = ['rpl', 'secret', 'a1b2c3d4e5f6'].join('_');
const HEX_40 = '0123456789abcdef'.repeat(3); // 48 hex chars
const ENV_TOKEN = `ghp${'_'}Zz9${'k'.repeat(30)}1`; // letters + digits, env-file style

function kinds(findings: Finding[]): string[] {
  return findings.map((f) => f.kind);
}

describe('scanText', () => {
  it('catches a Replit app secret anywhere, even unassigned', () => {
    const findings = scanText('a.ts', `const note = "${RPL_TOKEN}";`);
    expect(kinds(findings)).toContain('Replit app secret');
    expect(findings[0]?.line).toBe(1);
  });

  it('catches a quoted literal assigned to a secret-like ALL_CAPS name', () => {
    const line = `${['SYNAPSE', 'APP', 'SECRET'].join('_')}: '${RPL_TOKEN}'`;
    expect(scanText('b.ts', line).length).toBeGreaterThan(0);
  });

  it('catches an env-file style assignment (unquoted, mixed letters+digits)', () => {
    const findings = scanText('.env.example', `${['GITHUB', 'TOKEN'].join('_')}=${ENV_TOKEN}`);
    expect(kinds(findings)).toContain('literal assigned to a secret-like name');
  });

  it('catches a long hex literal next to a secret-ish word', () => {
    const findings = scanText('c.ts', `const signingToken = "${HEX_40}";`);
    expect(kinds(findings)).toContain('high-entropy literal near a secret-like word');
  });

  it('reports file and line and masks the value in the snippet', () => {
    const text = `const a = 1;\nconst b = "${RPL_TOKEN}";`;
    const [finding] = scanText('server/x.ts', text);
    expect(finding).toMatchObject({ file: 'server/x.ts', line: 2 });
    expect(finding?.masked).toContain('masked');
    expect(finding?.masked).not.toContain(RPL_TOKEN);
  });

  it('ignores placeholder values, empty env lines, and identifier-only assignments', () => {
    const name = ['APP', 'SESSION', 'SECRET'].join('_');
    const clean = [
      `${name}=`, // .env.example style: empty
      `${name}: 'your-secret-here'`, // placeholder wording
      `${name} = sessionSecret`, // an identifier, not a value (no digit)
      `${name}: undefined,`, // keyword
      `const url = 'https://citadel.staging.noonedu.io';`, // config, not a secret
    ].join('\n');
    expect(scanText('d.ts', clean)).toEqual([]);
  });

  it('ignores long identifiers when no secret-ish word is nearby', () => {
    const line = `const table = 'really_long_warehouse_identifier_name_over_32';`;
    expect(scanText('e.ts', line)).toEqual([]);
  });
});

describe('scanFiles', () => {
  it('scans provided files via the injected reader and skips binary content', () => {
    const files: Record<string, Buffer> = {
      'ok.ts': Buffer.from('const x = 1;'),
      'leak.ts': Buffer.from(`const t = "${RPL_TOKEN}";`),
      'img.png': Buffer.concat([Buffer.from([0, 1, 2, 0]), Buffer.from(RPL_TOKEN)]),
    };
    const findings = scanFiles(Object.keys(files), (f) => {
      const buf = files[f];
      if (!buf) {
        throw new Error('missing');
      }
      return buf;
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.file).toBe('leak.ts');
  });

  it('treats an unreadable file as skipped, not a crash', () => {
    expect(
      scanFiles(['gone.ts'], () => {
        throw new Error('ENOENT');
      }),
    ).toEqual([]);
  });
});
