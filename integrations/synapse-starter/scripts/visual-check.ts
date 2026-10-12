// Drive the shipped app in a real browser, assert the things a builder notices but can't
// articulate, and leave screenshots behind for an agent to look at.
//
// OPTIONAL, and NOT part of the Replit path. Replit's Agent already tests the app it builds in a
// real browser, and its Design Canvas previews across phone/tablet/desktop — doing the same work
// here would just burn the builder's credits. This script exists for the consumers Replit doesn't
// cover: local `npm run dev`, and existing apps that adopted the SDK via INTEGRATE.md. There is
// deliberately no skill pointing at it, so no agent is nudged into running it on Replit.
//
// The division of labour, when you do run it: the ASSERTIONS below are the decider —
// deterministic, cheap, no model involved. The SCREENSHOTS are for a human's eyes.
//
// Playwright is NOT a dependency of this template. Its browser download is ~300MB, which every
// clone would pay on install for a check most sessions never run. It is imported on demand and
// the script explains the one-time setup if it's absent.
//
//   npm run dev                       # in another terminal — this script does not boot the app
//   npm run visual                    # every nav page, phone + desktop
//   npm run visual -- /reports /team  # just these routes
//
// Exit code 1 on any failed assertion, so it can gate a commit if a builder wants it to.

// This is a Node script (tsconfig lib is ES2022, no DOM) that also carries ONE function destined to
// run inside the browser. The reference below gives that function real DOM types instead of `any`,
// so a typo in an assertion is caught here rather than silently returning nothing at runtime.
/// <reference lib="dom" />

import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.env.VISUAL_BASE_URL ?? 'http://localhost:3000';
const OUT_DIR = resolve(process.cwd(), '.synapse-visual');

// Phone first: Noon's users are overwhelmingly on phones, and a layout that survives 390px
// almost always survives desktop. The reverse is not true.
const VIEWPORTS = [
  { label: 'phone', width: 390, height: 844 },
  { label: 'desktop', width: 1280, height: 800 },
];

interface Problem {
  route: string;
  viewport: string;
  kind: string;
  detail: string;
}

// Assertions that run INSIDE the page. Kept as one stringified function so it can be handed to
// page.evaluate without a build step. Everything here is measurable — no aesthetics, no judgement.
function inPageAssertions(): { kind: string; detail: string }[] {
  const problems: { kind: string; detail: string }[] = [];
  const doc = document.documentElement;

  const describe = (el: Element): string => {
    const tag = el.tagName.toLowerCase();
    const cls =
      typeof el.className === 'string' && el.className ? `.${el.className.split(/\s+/)[0]}` : '';
    const text = (el.textContent ?? '').trim().slice(0, 40);
    return `${tag}${cls}${text ? ` — "${text}${text.length === 40 ? '…' : ''}"` : ''}`;
  };

  // 1. The page rendered something. A blank page is the most common agent-built failure and the
  //    one a passing test suite is least likely to catch.
  const visibleText = (document.body.innerText ?? '').trim();
  if (visibleText.length < 10) {
    problems.push({ kind: 'blank-page', detail: 'the page rendered almost no visible text' });
  }

  // 2. No horizontal scrolling. Works for RTL as well as LTR: comparing scrollWidth to clientWidth
  //    is direction-agnostic, unlike anything based on scrollLeft.
  if (doc.scrollWidth > doc.clientWidth + 1) {
    problems.push({
      kind: 'horizontal-scroll',
      detail: `page scrolls sideways (${doc.scrollWidth}px of content in a ${doc.clientWidth}px viewport)`,
    });
  }

  // 3. Nothing sticks out past the viewport. Finds the specific culprit, which #2 alone doesn't —
  //    usually a wide table or a long unbroken string.
  for (const el of Array.from(document.body.querySelectorAll('*'))) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    // A deliberately scrollable container (overflow-x:auto) is allowed to hold wide content —
    // that is the sanctioned fix for wide tables, not a defect.
    const style = window.getComputedStyle(el);
    if (style.overflowX === 'auto' || style.overflowX === 'scroll') continue;
    if (rect.right > doc.clientWidth + 1 || rect.left < -1) {
      problems.push({ kind: 'overflows-viewport', detail: describe(el) });
      break; // one is enough to act on; the rest are usually the same element's ancestors
    }
  }

  // 4. No clipped text. `overflow: hidden` plus content wider than its box means the builder is
  //    reading half a word — invisible to every non-visual test.
  for (const el of Array.from(document.body.querySelectorAll('*'))) {
    const style = window.getComputedStyle(el);
    if (style.overflow !== 'hidden' && style.overflowX !== 'hidden') continue;
    if (style.textOverflow === 'ellipsis') continue; // deliberate truncation
    const text = (el.textContent ?? '').trim();
    if (!text) continue;
    if (el.scrollWidth > el.clientWidth + 2) {
      problems.push({ kind: 'clipped-text', detail: describe(el) });
      break;
    }
  }

  // 5. Every image actually loaded. A broken image is loud to a human, silent to a test.
  for (const img of Array.from(document.images)) {
    if (img.complete && img.naturalWidth === 0) {
      problems.push({ kind: 'broken-image', detail: img.getAttribute('src') ?? '(no src)' });
    }
  }

  // 6. Tap targets on phones. Below ~32px is a real miss-rate problem for a teacher using this
  //    one-handed between classes; the WCAG floor is 24px and 44px is the comfortable target.
  if (window.innerWidth < 500) {
    for (const el of Array.from(document.querySelectorAll('a, button, [role="button"]'))) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.height < 24 || rect.width < 24) {
        problems.push({
          kind: 'tap-target-too-small',
          detail: `${describe(el)} (${Math.round(rect.width)}×${Math.round(rect.height)}px)`,
        });
        break;
      }
    }
  }

  return problems;
}

// Read the app's own nav to find its routes, so a page added to the registry is checked without
// anyone remembering to list it here.
async function discoverRoutes(page: {
  goto: (url: string, opts?: unknown) => Promise<unknown>;
  evaluate: <T>(fn: () => T) => Promise<T>;
}): Promise<string[]> {
  await page.goto(`${BASE}/?surface=app`, { waitUntil: 'networkidle' });
  const hrefs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href^="/"]'))
      .map((a) => a.getAttribute('href') ?? '')
      .filter(Boolean),
  );
  const routes = new Set<string>(['/']);
  for (const href of hrefs) {
    const path = (href.split('?')[0] ?? '').split('#')[0] ?? '';
    // /synapse is the template's frozen scaffolding corner, not the builder's product.
    if (path && path !== '/synapse') routes.add(path);
  }
  return [...routes];
}

async function main(): Promise<void> {
  // Variable specifier keeps TypeScript from resolving 'playwright' at build time — the package is
  // intentionally absent from package.json (see the header).
  const specifier = 'playwright';
  // biome-ignore lint/suspicious/noExplicitAny: on-demand import of an unlisted optional dep
  let playwright: any;
  try {
    playwright = await import(specifier);
  } catch {
    console.error(
      [
        'Visual checks need Playwright, which this template does not install by default',
        '(its browser download is ~300MB). One-time setup:',
        '',
        '  npm install --no-save playwright && npx playwright install chromium',
        '',
        'Then run `npm run visual` again.',
      ].join('\n'),
    );
    process.exit(1);
  }

  try {
    const res = await fetch(`${BASE}/`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok && res.status >= 500) throw new Error(`server answered ${res.status}`);
  } catch {
    console.error(`No app answering at ${BASE}. Start it first:\n\n  npm run dev\n`);
    process.exit(1);
  }

  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const browser = await playwright.chromium.launch();
  const problems: Problem[] = [];
  const shots: string[] = [];

  try {
    const scout = await browser.newPage();
    const argRoutes = process.argv.slice(2).filter((a) => a.startsWith('/'));
    const routes = argRoutes.length > 0 ? argRoutes : await discoverRoutes(scout);
    await scout.close();
    console.log(`[visual] ${routes.length} route(s): ${routes.join(', ')}`);

    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 2,
      });

      for (const route of routes) {
        const page = await context.newPage();
        const consoleErrors: string[] = [];
        const failedRequests: string[] = [];

        // A console error or a failed request is a defect even when the page looks fine — it is
        // the difference between "works on my data" and "works".
        page.on('console', (msg: { type: () => string; text: () => string }) => {
          if (msg.type() === 'error') consoleErrors.push(msg.text());
        });
        page.on('requestfailed', (req: { url: () => string }) => {
          failedRequests.push(req.url());
        });
        page.on('pageerror', (err: Error) => {
          consoleErrors.push(`uncaught: ${err.message}`);
        });

        const url = `${BASE}${route}${route.includes('?') ? '&' : '?'}surface=app`;
        try {
          await page.goto(url, { waitUntil: 'networkidle', timeout: 20_000 });
        } catch (err) {
          problems.push({
            route,
            viewport: viewport.label,
            kind: 'navigation-failed',
            detail: err instanceof Error ? err.message : String(err),
          });
          await page.close();
          continue;
        }

        for (const p of await page.evaluate(inPageAssertions)) {
          problems.push({ route, viewport: viewport.label, ...p });
        }
        for (const text of consoleErrors) {
          problems.push({ route, viewport: viewport.label, kind: 'console-error', detail: text });
        }
        for (const url of failedRequests) {
          problems.push({ route, viewport: viewport.label, kind: 'request-failed', detail: url });
        }

        const slug = route === '/' ? 'home' : route.replace(/^\//, '').replace(/\//g, '-');
        const file = resolve(OUT_DIR, `${slug}-${viewport.label}.png`);
        await page.screenshot({ path: file, fullPage: true });
        shots.push(file);
        await page.close();
      }

      await context.close();
    }
  } finally {
    await browser.close();
  }

  console.log(`\n[visual] ${shots.length} screenshot(s) in ${OUT_DIR}`);
  for (const shot of shots) console.log(`  ${shot}`);

  if (problems.length === 0) {
    console.log('\n[visual] no layout problems found. Now LOOK at the screenshots — these checks');
    console.log('[visual] measure correctness, not taste.');
    return;
  }

  console.error(`\n[visual] ${problems.length} problem(s):`);
  for (const p of problems) {
    console.error(`  ✗ ${p.route} @ ${p.viewport} — ${p.kind}: ${p.detail}`);
  }
  process.exit(1);
}

main().catch((err) => {
  console.error('[visual] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
