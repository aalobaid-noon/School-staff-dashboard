import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkTemplateVersion, classify, type OwnershipMap } from './check-template-version.js';

// Test against the REAL ownership map — these assertions are the contract's spec.
const map = JSON.parse(
  readFileSync(resolve(__dirname, '../.synapse/ownership.json'), 'utf8'),
) as OwnershipMap;

describe('classify (most-specific-wins over the real ownership map)', () => {
  it('resolves the server/ nesting: scaffolding vs shared index vs builder queries', () => {
    expect(classify('server/kit.ts', map)).toBe('synapse-owned');
    expect(classify('server/index.ts', map)).toBe('shared');
    expect(classify('server/queries/my-read.sql.ts', map)).toBe('builder-owned');
    expect(classify('server/queries/index.ts', map)).toBe('shared');
  });

  it('releases the app surface to the builder except the explicit allowlist', () => {
    expect(classify('client/app/pages/home.tsx', map)).toBe('builder-owned');
    expect(classify('client/app/AppShell.tsx', map)).toBe('builder-owned');
    expect(classify('client/app/pages/synapse.tsx', map)).toBe('synapse-owned');
    expect(classify('client/app/blocks/ViewBlock.tsx', map)).toBe('synapse-owned');
    expect(classify('client/app/theme.css', map)).toBe('shared');
  });

  it('defaults unmatched paths to builder-owned', () => {
    expect(classify('SPEC.md', map)).toBe('builder-owned');
    expect(classify('some/new/thing.ts', map)).toBe('builder-owned');
  });

  it('claims the kit machinery and the template surface', () => {
    expect(classify('TEMPLATE_VERSION', map)).toBe('synapse-owned');
    expect(classify('.synapse/ownership.json', map)).toBe('synapse-owned');
    expect(classify('.agents/skills/synapse-upgrade/SKILL.md', map)).toBe('synapse-owned');
    expect(classify('.github/workflows/template-version.yml', map)).toBe('synapse-owned');
    expect(classify('client/console/HomeTab.tsx', map)).toBe('synapse-owned');
    expect(classify('vendor/noonacademy-synapse-sdk-0.2.0.tgz', map)).toBe('synapse-owned');
  });
});

describe('checkTemplateVersion', () => {
  it('passes when no synapse-owned path changed', () => {
    const r = checkTemplateVersion(['client/app/pages/home.tsx', 'SPEC.md'], map);
    expect(r.ok).toBe(true);
    expect(r.synapseOwnedChanged).toEqual([]);
  });

  it('fails a synapse-owned change that forgot the bump and the entry', () => {
    const r = checkTemplateVersion(['client/console/HomeTab.tsx'], map);
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(['TEMPLATE_VERSION', 'UPGRADES.md']);
  });

  it('fails when only one of the two release files was updated', () => {
    const r = checkTemplateVersion(['server/kit.ts', 'TEMPLATE_VERSION'], map);
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(['UPGRADES.md']);
  });

  it('passes a disciplined release', () => {
    const r = checkTemplateVersion(['server/kit.ts', 'TEMPLATE_VERSION', 'UPGRADES.md'], map);
    expect(r.ok).toBe(true);
  });
});
