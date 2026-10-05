import { readFileSync } from 'node:fs';

// First-run setup state for the console Home tab's checklist: which secrets are present
// (by NAME — values never leave the server) and whether SPEC.md has been filled in. The
// connection and verify checks reuse /__synapse/overview and /__synapse/verify; this module
// only covers what no existing endpoint reports.

export interface SetupProjection {
  secrets: Array<{ name: string; set: boolean; required: boolean }>;
  spec: { exists: boolean; filled: boolean };
}

// SYNAPSE_BASE_URL is not required: server/synapse.ts falls back to the staging URL when
// it's unset, so "missing" is a normal, working state for it.
const SECRET_NAMES: Array<{ name: string; required: boolean }> = [
  { name: 'SYNAPSE_APP_ID', required: true },
  { name: 'SYNAPSE_APP_SECRET', required: true },
  { name: 'SYNAPSE_BASE_URL', required: false },
];

// SPEC.md's template guarantees the marker is the top status line, so only the first line is
// checked — the phrase also appears in the file's own prose (and stays there after filling),
// so a whole-file search would read a completed spec as unfilled.
export const SPEC_UNFILLED_MARKER = 'not yet filled in';

export function buildSetup(input: {
  env: Record<string, string | undefined>;
  specText: string | null;
}): SetupProjection {
  const { env, specText } = input;
  const firstLine = specText?.split('\n', 1)[0] ?? '';
  return {
    secrets: SECRET_NAMES.map(({ name, required }) => ({
      name,
      set: Boolean(env[name]),
      required,
    })),
    spec: {
      exists: specText !== null,
      filled: specText !== null && !firstLine.includes(SPEC_UNFILLED_MARKER),
    },
  };
}

// Missing file -> null (a deleted SPEC.md is a red check, not a crash).
export function readSpecText(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}
