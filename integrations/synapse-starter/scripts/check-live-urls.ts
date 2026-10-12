// Keeps the fetch-live knowledge URLs honest: every raw.githubusercontent.com URL in
// replit.md, AGENTS.md, and the skill files must point at noonAcademy/synapse-starter@main
// AND at a path that exists in this tree. A renamed skill file silently 404ing its own fetch
// instruction is this design's one failure mode — the local check makes it un-shippable.
//
// Two layers, mirroring server/kit.ts's resilience stance:
//   1. LOCAL (offline-safe, hard-fail): prefix + local-path existence. The files and their
//      URLs ship together, so URL-vs-path drift needs no network to catch.
//   2. NETWORK (best-effort): GET each URL, 3s timeout. A network error skips silently
//      (offline CI, clones behind proxies — same fail-silent stance as the kit-update
//      check). A non-200 for a file that EXISTS locally is a warning, not a failure — that
//      is the normal state of a PR that adds or renames a file (the URL resolves on merge).
//      A non-200 for a file missing locally is already a layer-1 failure.
//
// Part of `npm run verify` (`npm run check:urls` runs it alone). In a clone this is inert
// in practice: layer 1 always holds for files that shipped together, and layer 2 never
// hard-fails on its own.
//
// Usage: tsx scripts/check-live-urls.ts

import { existsSync, readdirSync, readFileSync } from 'node:fs';

export const RAW_PREFIX = 'https://raw.githubusercontent.com/noonAcademy/synapse-starter/main/';

// The knowledge surface: the bootstrap router, the rulebook, and every skill.
export function knowledgeFiles(): string[] {
  const skills = readdirSync('.agents/skills').map((d) => `.agents/skills/${d}/SKILL.md`);
  return ['replit.md', 'AGENTS.md', 'skill/SKILL.md', ...skills];
}

// Bare URLs (blockquote headers) and markdown-link URLs; stop at whitespace or closers
// (`<` too — AGENTS.md's `<its path>` placeholder is prose, not a URL segment).
const URL_RE = /https:\/\/raw\.githubusercontent\.com\/[^\s)\]">`<]+/g;

export function extractRawUrls(text: string): string[] {
  return text.match(URL_RE) ?? [];
}

export interface UrlProblem {
  file: string;
  url: string;
  problem: string;
}

// Layer 1: every URL must carry the trusted prefix and name a path that exists locally.
export function checkLocal(
  urlsByFile: Map<string, string[]>,
  exists: (path: string) => boolean = existsSync,
): UrlProblem[] {
  const problems: UrlProblem[] = [];
  for (const [file, urls] of urlsByFile) {
    for (const url of urls) {
      if (!url.startsWith(RAW_PREFIX)) {
        problems.push({
          file,
          url,
          problem: `unexpected prefix — only ${RAW_PREFIX} is this kit's trusted source`,
        });
        continue;
      }
      const path = decodeURIComponent(url.slice(RAW_PREFIX.length));
      // A bare prefix (trust note, placeholder prose) names the trusted source, not a file.
      if (path === '') continue;
      if (!exists(path)) {
        problems.push({ file, url, problem: `no local file at '${path}' — URL and tree drifted` });
      }
    }
  }
  return problems;
}

async function checkNetwork(allUrls: string[]): Promise<void> {
  // Bare prefix mentions are prose (see checkLocal) — there is nothing to resolve.
  const urls = allUrls.filter((u) => u.length > RAW_PREFIX.length);
  let ok = 0;
  let skipped = 0;
  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3_000) });
      if (res.ok) {
        ok += 1;
      } else {
        console.warn(
          `[check-live-urls] warn: ${res.status} for ${url} — expected only while this PR ` +
            `is unmerged (the file is new or renamed on this branch); resolves on merge.`,
        );
      }
    } catch {
      skipped += 1; // offline / blocked / timeout — never a failure, same as the kit check
    }
  }
  console.log(`[check-live-urls] network: ${ok} resolved, ${skipped} skipped (no network).`);
}

async function main(): Promise<void> {
  const urlsByFile = new Map<string, string[]>();
  for (const file of knowledgeFiles()) {
    urlsByFile.set(file, extractRawUrls(readFileSync(file, 'utf8')));
  }
  const all = [...urlsByFile.values()].flat();
  const problems = checkLocal(urlsByFile);
  if (problems.length > 0) {
    for (const p of problems) {
      console.error(`[check-live-urls] FAIL ${p.file}: ${p.url}\n  ${p.problem}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log(`[check-live-urls] local: ${all.length} URLs across ${urlsByFile.size} files — OK.`);
  await checkNetwork(all);
}

// Same import guard as scripts/check-template-version.ts: tests import the pure functions.
if (!process.env.VITEST) {
  await main();
}
