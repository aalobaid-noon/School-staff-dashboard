// Release-discipline check for the TEMPLATE repO ONLY (run by .github/workflows/
// template-version.yml on PRs to main — never part of `npm run verify`, which clones run):
// if a PR changes any synapse-owned path, it must also bump TEMPLATE_VERSION and append an
// UPGRADES.md entry. The ownership classes come from .synapse/ownership.json — the same
// contract UPGRADE.md applies clone-side.
//
// Usage: tsx scripts/check-template-version.ts [<base-ref>]   (default: origin/main)

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export type OwnerClass = 'synapse-owned' | 'shared' | 'builder-owned';

export interface OwnershipMap {
  synapseOwned: string[];
  shared: string[];
  builderOwned: string[];
}

// Pattern language (kept deliberately tiny — see ownership.json's $comment): an exact file
// path, or '<dir>/**' meaning everything under that directory.
function matchLength(pattern: string, path: string): number | null {
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -2); // keep the trailing '/'
    return path.startsWith(prefix) ? prefix.length : null;
  }
  return pattern === path ? pattern.length : null;
}

// Most-specific-wins across all three classes: the pattern with the longest literal prefix
// decides the owner. No match at all = builder-owned (the map's default).
export function classify(path: string, map: OwnershipMap): OwnerClass {
  let owner: OwnerClass = 'builder-owned';
  let best = -1;
  const classes: Array<[OwnerClass, string[]]> = [
    ['synapse-owned', map.synapseOwned],
    ['shared', map.shared],
    ['builder-owned', map.builderOwned],
  ];
  for (const [cls, patterns] of classes) {
    for (const pattern of patterns) {
      const len = matchLength(pattern, path);
      if (len !== null && len > best) {
        best = len;
        owner = cls;
      }
    }
  }
  return owner;
}

export interface CheckResult {
  ok: boolean;
  synapseOwnedChanged: string[];
  missing: string[]; // which of TEMPLATE_VERSION / UPGRADES.md the PR forgot
}

export function checkTemplateVersion(changedFiles: string[], map: OwnershipMap): CheckResult {
  const synapseOwnedChanged = changedFiles.filter((f) => classify(f, map) === 'synapse-owned');
  if (synapseOwnedChanged.length === 0) {
    return { ok: true, synapseOwnedChanged, missing: [] };
  }
  const changed = new Set(changedFiles);
  const missing = ['TEMPLATE_VERSION', 'UPGRADES.md'].filter((f) => !changed.has(f));
  return { ok: missing.length === 0, synapseOwnedChanged, missing };
}

function main(): void {
  const baseRef = process.argv[2] ?? 'origin/main';
  const raw = JSON.parse(readFileSync('.synapse/ownership.json', 'utf8')) as OwnershipMap;
  const diff = execFileSync('git', ['diff', '--name-only', `${baseRef}...HEAD`], {
    encoding: 'utf8',
  });
  const changedFiles = diff.split('\n').filter(Boolean);

  const result = checkTemplateVersion(changedFiles, raw);
  if (result.synapseOwnedChanged.length === 0) {
    console.log('[template-version] no synapse-owned paths changed — nothing to enforce.');
    return;
  }
  console.log(
    `[template-version] synapse-owned paths changed:\n  ${result.synapseOwnedChanged.join('\n  ')}`,
  );
  if (result.ok) {
    console.log('[template-version] TEMPLATE_VERSION bumped and UPGRADES.md updated — OK.');
    return;
  }
  console.error(
    `\n[template-version] FAIL — this PR ships template changes without telling the fleet.\n` +
      `Missing: ${result.missing.join(' and ')}.\n` +
      `Bump TEMPLATE_VERSION (YYYY.MM.DD, or .N for a same-day second bump) and append the\n` +
      `UPGRADES.md entry for this change — you're shipping it, so you write the recipe while\n` +
      `the context is fresh. See RELEASING.md.`,
  );
  process.exitCode = 1;
}

// Same import guard as server/index.ts: tests import the pure functions without running git.
if (!process.env.VITEST) {
  main();
}
