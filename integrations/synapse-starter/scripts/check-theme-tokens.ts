// Enforce the one convention that keeps this app rethemeable: the shipped app's look lives in
// client/app/theme.css tokens, and app components consume the utilities those tokens generate —
// never a raw color, radius, or font.
//
// WHY THIS IS A CHECK AND NOT A RULE IN A SKILL. A rule in AGENTS.md only binds whoever reads
// AGENTS.md. Replit's Agent 4 Design Canvas applies visual edits straight to the codebase
// WITHOUT running a full agent loop — nudge a button color, it lands in the file. No agent reads
// the rulebook on that path and no skill can fire, so prose cannot defend this convention. A
// check can, because `npm run verify` runs on every deployment build no matter who or what wrote
// the code.
//
// (Whether the Design Canvas actually hardcodes anything is unverified at the time of writing.
// This guard costs nothing if it doesn't, and catches it silently if it does — along with the
// far more common case of an agent or a human pasting a hex value in a hurry.)
//
// Scope: client/app/** only — the SHIPPED app. The builder console (client/console/,
// client/ui.tsx) keeps its own fixed styling on purpose and is never themed, so it is exempt.
// theme.css itself is exempt for the obvious reason: it is where the raw values belong.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const APP_DIR = 'client/app';
// theme.css holds the real values; .test files may assert against literal colors.
const EXEMPT = new Set([join(APP_DIR, 'theme.css')]);

export interface TokenViolation {
  file: string;
  line: number;
  text: string;
  reason: string;
}

interface Pattern {
  // `global` is required — every match on a line is reported, not just the first.
  regex: RegExp;
  reason: string;
}

// ORDER MATTERS: the first pattern to match a line is the one reported, so the most SPECIFIC
// shapes come first. `bg-[#fff]` is both an arbitrary Tailwind value and a hex color; naming it
// the former tells the reader what to do about it, naming it the latter doesn't.
const PATTERNS: Pattern[] = [
  {
    // Arbitrary-value color/radius/font classes: bg-[#fff], rounded-[3px], font-[Inter].
    regex: /\b(?:bg|text|border|rounded|font|ring|fill|stroke)-\[[^\]]+\]/g,
    reason: 'arbitrary Tailwind value — add or adjust a token in theme.css instead',
  },
  {
    // Tailwind's built-in palette classes: bg-slate-700, text-red-500, border-gray-200.
    // The app's own semantic utilities (bg-surface, text-ink) carry no numeric step, so they
    // don't match — which is exactly the line this check is drawing.
    regex:
      /\b(?:bg|text|border|ring|fill|stroke|from|via|to|decoration|outline|shadow|accent|caret|divide|placeholder)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g,
    reason: "Tailwind palette class — the app's look comes from theme.css tokens only",
  },
  {
    // Inline styles are how a visual editor most plausibly writes a one-off tweak.
    regex: /style=\{\{[^}]*(?:color|background|border|font|radius)/gi,
    reason: 'inline style — restyling belongs in theme.css, not on the element',
  },
  {
    // #fff / #ffffff / #ffffffff — the generic catch, last.
    regex: /#[0-9a-fA-F]{3,8}\b/g,
    reason: 'hardcoded hex color — use a theme token utility (bg-surface, text-ink, …)',
  },
  {
    regex: /\b(?:rgb|rgba|hsl|hsla)\s*\(/g,
    reason: 'hardcoded color function — use a theme token utility',
  },
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
      continue;
    }
    if (['.tsx', '.ts', '.css'].includes(extname(entry))) out.push(full);
  }
  return out;
}

// A line the check must not judge: a comment explaining the rule, or a fallback constant that
// exists precisely because a token can't be read yet (ChartBlock's FALLBACK_SERIES). Both are
// marked with an explicit opt-out so an exemption is always visible in the diff.
function isExempted(line: string): boolean {
  return line.includes('theme-tokens-ignore');
}

export function findViolations(files: string[], read = readFileSync): TokenViolation[] {
  const violations: TokenViolation[] = [];
  for (const file of files) {
    if (EXEMPT.has(file)) continue;
    const lines = String(read(file, 'utf8')).split('\n');
    lines.forEach((line, i) => {
      if (isExempted(line)) return;
      for (const { regex, reason } of PATTERNS) {
        regex.lastIndex = 0;
        if (regex.test(line)) {
          violations.push({ file, line: i + 1, text: line.trim().slice(0, 100), reason });
          return; // one finding per line is enough to act on
        }
      }
    });
  }
  return violations;
}

export function appFiles(): string[] {
  return walk(APP_DIR).map((f) => relative(process.cwd(), f));
}

function main(): void {
  const violations = findViolations(appFiles());
  if (violations.length === 0) {
    console.log('[check-theme-tokens] client/app is token-clean — OK.');
    return;
  }

  console.error(
    `[check-theme-tokens] ${violations.length} hardcoded style value(s) in the shipped app.\n` +
      "The app's look must come from client/app/theme.css tokens, so that changing the theme\n" +
      'changes the app. If a value genuinely cannot be a token, mark the line with a\n' +
      '`theme-tokens-ignore` comment so the exception is visible in review.\n',
  );
  for (const v of violations) {
    console.error(`  ✗ ${v.file}:${v.line} — ${v.reason}`);
    console.error(`      ${v.text}`);
  }
  process.exit(1);
}

// Skipped under Vitest, which imports the helpers above directly.
if (process.env.VITEST === undefined) {
  main();
}
