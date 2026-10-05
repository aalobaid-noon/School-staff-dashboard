import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The "secrets" step of `npm run verify` — first in the chain because it's the fastest and the
// most urgent: a committed credential is worse than a failing test. Scans TRACKED files only
// (git ls-files), so node_modules, .env, and dist are naturally out of scope. On a hit it
// fails with file, line, and the fix; the matched value is always masked, never echoed —
// a scanner that prints the secret it found has reproduced the leak.

export interface Finding {
  file: string;
  line: number;
  kind: string;
  /** The offending text with the value masked to its first four characters. */
  masked: string;
}

// Values that look like docs, not credentials ("your-secret-here", "<paste it here>", …).
// Assignment findings with a placeholder value are skipped; real tokens never look like this.
const PLACEHOLDER = /your|example|placeholder|changeme|dummy|sample|<|>|\.\.\.|xxx/i;

// Names that suggest the value is a credential. ALL_CAPS env style on purpose: camelCase test
// fixtures (`appSecret: 'app-secret'`) are the app's own fakes, while a pasted real credential
// lands next to the env-var name it came from.
const SECRETISH_NAME = /\b[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY)[A-Z0-9_]*\b/;

interface Pattern {
  kind: string;
  re: RegExp;
  /** Capture group holding the value to mask (and to test against PLACEHOLDER). */
  valueGroup: number;
  skipPlaceholders: boolean;
}

const PATTERNS: Pattern[] = [
  {
    // Citadel app secrets have a fixed prefix, so they're detectable anywhere, even unassigned.
    kind: 'Replit app secret',
    re: /(rpl_secret_[A-Za-z0-9]{8,})/,
    valueGroup: 1,
    skipPlaceholders: false,
  },
  {
    // NAME = 'value' / NAME: "value" / NAME=value — a literal assigned to a secret-ish name.
    // The unquoted branch (env-file style) additionally requires a digit AND a letter: real
    // tokens virtually always mix both, while identifiers assigned in code (SOME_SECRET =
    // sessionSecret) and keywords (undefined) don't, and quoting isn't used in .env files.
    kind: 'literal assigned to a secret-like name',
    re: new RegExp(
      `${SECRETISH_NAME.source}\\s*[:=]\\s*(?:['"\`]([^'"\`\\s]{8,})['"\`]|((?=[A-Za-z0-9+/=_-]*\\d)(?=[A-Za-z0-9+/=_-]*[A-Za-z])[A-Za-z0-9+/=_-]{8,}))`,
    ),
    valueGroup: 1,
    skipPlaceholders: true,
  },
  {
    // A long hex/base64 run quoted on the same line as a secret-ish word. 32+ chars is past
    // any identifier this repo uses and into credential territory. No leading \b so camelCase
    // names (signingToken, apiKey) match too; the trailing lookahead still rejects mid-word
    // hits like SECRETISH or tokenizer.
    kind: 'high-entropy literal near a secret-like word',
    re: /(?:secret|token|password|credential|api.?key)s?(?![A-Za-z0-9])[^\n]{0,40}?['"`]([A-Fa-f0-9]{32,}|[A-Za-z0-9+/]{32,}={0,2}|[A-Za-z0-9_-]{32,})['"`]/i,
    valueGroup: 1,
    skipPlaceholders: true,
  },
];

function mask(value: string): string {
  return `${value.slice(0, 4)}…(${value.length} chars, masked)`;
}

// Scan one file's text. Exported for tests (which build their fixtures at runtime so this
// tracked file never trips the scan of the repo itself).
export function scanText(file: string, text: string): Finding[] {
  const findings: Finding[] = [];
  text.split('\n').forEach((lineText, i) => {
    for (const pattern of PATTERNS) {
      const match = pattern.re.exec(lineText);
      if (!match) {
        continue;
      }
      // The assignment pattern has two alternates (quoted / bare); take whichever captured.
      const value = match[pattern.valueGroup] ?? match[pattern.valueGroup + 1];
      if (!value || (pattern.skipPlaceholders && PLACEHOLDER.test(value))) {
        continue;
      }
      findings.push({
        file,
        line: i + 1,
        kind: pattern.kind,
        masked: lineText.trim().replace(value, mask(value)),
      });
    }
  });
  return findings;
}

function looksBinary(buf: Buffer): boolean {
  return buf.subarray(0, 8192).includes(0);
}

export function scanFiles(files: string[], read: (f: string) => Buffer = readFileSync): Finding[] {
  const findings: Finding[] = [];
  for (const file of files) {
    let buf: Buffer;
    try {
      buf = read(file);
    } catch {
      continue; // deleted-but-still-listed files aren't scan failures
    }
    if (!looksBinary(buf)) {
      findings.push(...scanText(file, buf.toString('utf8')));
    }
  }
  return findings;
}

function trackedFiles(): string[] {
  return execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
}

function main(): void {
  const files = trackedFiles();
  const findings = scanFiles(files);
  if (findings.length === 0) {
    console.log(`[scan-secrets] OK — no secret-like literals in ${files.length} tracked files.`);
    return;
  }
  for (const f of findings) {
    console.error(`[scan-secrets] ${f.file}:${f.line} — ${f.kind}`);
    console.error(`  ${f.masked}`);
  }
  console.error(
    `\n[scan-secrets] ${findings.length} possible secret${findings.length > 1 ? 's' : ''} in tracked files.` +
      "\nFix: remove the value from the code, put it in Replit's Secrets pane (the 🔒 icon)," +
      '\nand rotate the credential in the Citadel portal — once committed, treat it as exposed.',
  );
  process.exitCode = 1;
}

// Run only as a CLI (tsx scripts/scan-secrets.ts), never on import from tests.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
