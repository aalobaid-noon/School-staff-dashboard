import type { ReactNode } from 'react';
import { Card, CopyBox, Pill } from '../ui';
import { type LoadState, useJson } from '../useJson';
import type { TabId } from './ConsoleApp';
import type { VerifyState } from './useVerify';

// Mirrors server/overview.ts OverviewProjection (served by /__synapse/overview).
interface Overview {
  appId: string | null;
  baseUrl: string;
  configured: boolean;
  configError: string | null;
  connection: { ok: boolean; detail: string };
}
// Mirrors server/setup.ts SetupProjection (served by /__synapse/setup). Secret PRESENCE only —
// the server never sends values.
interface Setup {
  secrets: Array<{ name: string; set: boolean; required: boolean }>;
  spec: { exists: boolean; filled: boolean };
}
// Mirrors server/kit.ts KitProjection (served by /__synapse/kit). updateAvailable is already
// fail-silent server-side: any fetch/parse problem arrives here as false.
interface Kit {
  local: string | null;
  latest: string | null;
  updateAvailable: boolean;
}
interface ReadListItem {
  name: string;
  title: string;
  description: string;
}
// Mirrors what /__synapse/registry/status serves: server/registry.ts RegistryStatus plus the
// per-read staleness verdicts (readsFreshness). Only `stamp` and `reads` matter here; both are
// optional so an older or partial payload renders nothing rather than breaking the tab.
interface RegistryFreshnessPayload {
  stamp?: string;
  reads?: Array<{ name: string; title: string; registryVersion: string; verdict: string }>;
}
interface EventCatalog {
  total: number;
}

// The message a builder pastes to their coding agent to start the first build. Mirrors the
// AGENTS.md rules on purpose — read first, plan first, registry-checked reads, verify before
// done. Exported for unit testing (same pattern as GetDataTab's prompt builders).
export function buildKickoffPrompt(): string {
  return [
    'I want to build: <describe what you want in plain English>',
    '',
    'Before doing anything else, read AGENTS.md in full and follow it.',
    'Then run the plan-first interview (.agents/skills/synapse-plan-first/SKILL.md): interview ' +
      'me one question at a time, write SPEC.md, and get my approval before writing any code.',
    'For any Noon data, use the data registry with the noon-sql-analyst skill (skill/SKILL.md): ' +
      'bake reads as server/queries/<name>.sql.ts run through synapse.athenaQuery — never a raw ' +
      'fetch, never an invented table name.',
    'When you are done, run `npm run verify` and make it green before reporting back.',
  ].join('\n');
}

export function HomeTab({
  onNavigate,
  verify,
}: {
  onNavigate: (tab: TabId) => void;
  verify: VerifyState;
}) {
  const overview = useJson<Overview>('/__synapse/overview');
  const setup = useJson<Setup>('/__synapse/setup');
  const reads = useJson<ReadListItem[]>('/__synapse/reads');
  const catalog = useJson<EventCatalog>('/__synapse/catalog');
  const kit = useJson<Kit>('/__synapse/kit');
  const registry = useJson<RegistryFreshnessPayload>('/__synapse/registry/status');

  const readCount = reads.status === 'ready' ? reads.data.length : null;
  const firstView = reads.status === 'ready' ? reads.data[0]?.title : undefined;
  const eventKinds = catalog.status === 'ready' ? catalog.data.total : null;

  return (
    <section className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          What do you want to build?
        </h1>
        <p className="text-sm leading-relaxed text-slate-600">
          This app pulls live Noon data into your pages, and tells Noon when things happen in your
          app. Four checks tell you it's ready.
        </p>
      </div>

      <SetupChecklist overview={overview} setup={setup} verify={verify} />

      <KitUpdateNotice kit={kit} />

      <StaleReadsNotice registry={registry} />

      <KickoffCard />

      {/* The one primary action — the buried "get data" flow, promoted to the hero slot. */}
      <button
        type="button"
        onClick={() => onNavigate('get-data')}
        className="block w-full rounded-2xl border border-indigo-200 bg-indigo-50 p-5 text-left shadow-sm transition-colors hover:border-indigo-300 hover:bg-indigo-100/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
      >
        <span className="flex items-center justify-between gap-2">
          <span className="text-base font-semibold text-indigo-900">Get Noon data into my app</span>
          <span aria-hidden className="text-indigo-400">
            →
          </span>
        </span>
        <span className="mt-1 block text-sm text-indigo-800">
          Describe it in plain English. We turn it into a one-paste instruction for the Replit
          agent, which builds the page for you.
        </span>
      </button>

      <div className="grid gap-3 sm:grid-cols-2">
        <SecondaryCard
          onClick={() => onNavigate('views')}
          title={readCount === null ? 'Your views' : `Your views (${readCount})`}
        >
          {readCount === null
            ? 'See the live data pages in your app.'
            : readCount === 0
              ? 'No views yet — make your first one above.'
              : `${readCount} live view${readCount > 1 ? 's' : ''}${firstView ? `, including “${firstView}”` : ''}.`}
        </SecondaryCard>

        <SecondaryCard onClick={() => onNavigate('events')} title="What your app sends to Noon">
          {eventKinds === null
            ? 'The events your app can report, and the log of what it has sent.'
            : `${eventKinds} kinds of event your app can report — and the log of what it has sent.`}
        </SecondaryCard>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// First-run checklist
// ---------------------------------------------------------------------------

// 'skipped' is neither done nor broken: the check couldn't run in this environment. Keeping it
// distinct from 'bad' is the point — a red row sends the builder after a bug that isn't there.
type CheckStatus = 'pending' | 'good' | 'bad' | 'skipped';
interface Check {
  title: string;
  status: CheckStatus;
  summary: string;
  /** ONE plain-language instruction, shown when red or skipped. */
  fix?: ReactNode;
  /** Optional extra detail (e.g. per-secret pills), shown in any state once loaded. */
  extra?: ReactNode;
}

const DEFAULT_PORTAL_BASE = 'https://citadel.staging.noonedu.io';

function SetupChecklist({
  overview,
  setup,
  verify,
}: {
  overview: LoadState<Overview>;
  setup: LoadState<Setup>;
  verify: VerifyState;
}) {
  const portalBase = overview.status === 'ready' ? overview.data.baseUrl : DEFAULT_PORTAL_BASE;
  const checks: Check[] = [
    secretsCheck(setup, portalBase),
    connectionCheck(overview),
    planCheck(setup),
    verifyCheck(verify),
  ];

  return (
    <Card>
      <h2 className="text-sm font-semibold text-slate-900">Is your app ready?</h2>
      <ol className="mt-4 space-y-4">
        {checks.map((check, i) => (
          <ChecklistRow key={check.title} n={i + 1} check={check} />
        ))}
      </ol>
    </Card>
  );
}

function secretsCheck(setup: LoadState<Setup>, portalBase: string): Check {
  if (setup.status !== 'ready') {
    return {
      title: 'Secrets present',
      status: 'pending',
      summary:
        setup.status === 'error' ? `Couldn't check: ${setup.message}` : 'Checking your keys…',
    };
  }

  const secrets = setup.data.secrets;
  const missing = secrets.filter((s) => s.required && !s.set);
  const extra = (
    <span className="flex flex-wrap gap-1">
      {secrets.map((s) => (
        <Pill
          key={s.name}
          tone={s.set ? 'good' : s.required ? 'error' : 'neutral'}
          title={
            s.required || s.set ? undefined : 'Optional — the default staging Citadel is used.'
          }
        >
          {s.name}
          {s.set ? '' : s.required ? ' — missing' : ' — default'}
        </Pill>
      ))}
    </span>
  );

  if (missing.length > 0) {
    return {
      title: 'Secrets present',
      status: 'bad',
      summary: `${missing.length} key${missing.length > 1 ? 's' : ''} missing.`,
      extra,
      fix: (
        <>
          Add the missing key{missing.length > 1 ? 's' : ''} in Replit's <strong>Secrets</strong>{' '}
          pane (the 🔒 icon). Your app credentials come from the Citadel portal:{' '}
          <code className="font-mono text-xs">{portalBase}/portal/replit-apps</code> → Create app.
        </>
      ),
    };
  }
  return { title: 'Secrets present', status: 'good', summary: 'All keys are set.', extra };
}

function connectionCheck(overview: LoadState<Overview>): Check {
  if (overview.status !== 'ready') {
    return {
      title: 'Connected to Noon',
      status: 'pending',
      summary:
        overview.status === 'error'
          ? `Couldn't check: ${overview.message}`
          : 'Checking your connection…',
    };
  }
  if (overview.data.connection.ok) {
    return {
      title: 'Connected to Noon',
      status: 'good',
      summary: overview.data.connection.detail,
    };
  }
  return {
    title: 'Connected to Noon',
    status: 'bad',
    summary: overview.data.connection.detail,
    fix: (
      <>
        Press <strong>Run</strong> again to retry. If it stays red, ask your agent to use the{' '}
        <strong>synapse-error-report</strong> skill and share the report in the Synapse channel.
      </>
    ),
  };
}

function planCheck(setup: LoadState<Setup>): Check {
  if (setup.status !== 'ready') {
    return {
      title: 'Plan written',
      status: 'pending',
      summary: setup.status === 'error' ? `Couldn't check: ${setup.message}` : 'Checking SPEC.md…',
    };
  }
  if (setup.data.spec.filled) {
    return {
      title: 'Plan written',
      status: 'good',
      summary: 'SPEC.md is filled in — your app has a plan.',
    };
  }
  return {
    title: 'Plan written',
    status: 'bad',
    summary: setup.data.spec.exists
      ? 'SPEC.md is still the empty template.'
      : 'SPEC.md is missing.',
    fix: <>Ask your agent to interview you — copy the kickoff prompt below.</>,
  };
}

function verifyCheck(verify: VerifyState): Check {
  if (verify.status === 'ready') {
    if (verify.data.ok) {
      return {
        title: 'All checks pass',
        status: 'good',
        summary: 'Secret scan, typecheck, lint, tests, and theme tokens are all green.',
      };
    }
    const failing = verify.data.steps.filter((s) => s.status === 'fail');
    if (failing.length > 0) {
      return {
        title: 'All checks pass',
        status: 'bad',
        summary: `${failing.map((s) => s.name).join(', ')} failing.`,
        fix: (
          <>
            Ask your agent to fix the failing check — the chip in the header shows exactly what
            failed.
          </>
        ),
      };
    }
    // Nothing failed; something just couldn't run. Replit's workspace Run installs with
    // `--omit=dev`, so tsc/biome/vitest aren't here — which is a fact about the environment, not
    // a verdict on the code. Saying "failing" would send the builder after a bug that isn't there.
    const skipped = verify.data.steps.filter((s) => s.status === 'unavailable');
    return {
      title: 'All checks pass',
      status: 'skipped',
      summary: `${skipped.map((s) => s.name).join(', ')} couldn't run in this workspace — the tools they need aren't installed here.`,
      fix: (
        <>
          Nothing to fix: your <strong>Deploy</strong> build installs the full toolchain and runs
          these checks before shipping. To run them here now, type{' '}
          <code className="font-mono text-xs">npm run verify</code> in the Shell.
        </>
      ),
    };
  }
  return {
    title: 'All checks pass',
    status: 'pending',
    summary:
      verify.status === 'error'
        ? `Couldn't check: ${verify.message}`
        : 'Running the secret scan, typecheck, lint, tests, and theme check…',
  };
}

const CHECK_PILL: Record<CheckStatus, { tone: 'good' | 'error' | 'neutral'; label: string }> = {
  good: { tone: 'good', label: 'Done' },
  bad: { tone: 'error', label: 'Needs you' },
  skipped: { tone: 'neutral', label: 'Not run here' },
  pending: { tone: 'neutral', label: 'Checking…' },
};

function ChecklistRow({ n, check }: { n: number; check: Check }) {
  const pill = CHECK_PILL[check.status];
  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
          check.status === 'good'
            ? 'bg-emerald-100 text-emerald-700'
            : check.status === 'bad'
              ? 'bg-rose-100 text-rose-700'
              : 'bg-slate-100 text-slate-500'
        }`}
      >
        {n}
      </span>
      <div className="min-w-0 space-y-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900">
          {check.title}
          <Pill tone={pill.tone}>{pill.label}</Pill>
        </p>
        <p className="text-sm text-slate-600">{check.summary}</p>
        {check.extra}
        {check.fix && (check.status === 'bad' || check.status === 'skipped') && (
          // Rose only when something is actually wrong — a skipped check reads as information.
          <p
            className={
              check.status === 'bad'
                ? 'rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800'
                : 'rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600'
            }
          >
            {check.fix}
          </p>
        )}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Kit update notice
// ---------------------------------------------------------------------------

// The paste-to-agent message the copy button carries — it names the synapse-upgrade skill's
// trigger phrase, so pasting it into the Replit Agent chat starts the guided upgrade.
// Exported for unit testing (same pattern as buildKickoffPrompt).
export function buildKitUpdateMessage(latest: string): string {
  return `Kit update available (${latest}): tell your agent to upgrade the synapse kit`;
}

// The paste-to-agent message for reads baked against an older registry. Names the SQL skill so
// pasting it starts the re-check with the right tool. Exported for unit testing.
export function buildStaleReadsMessage(names: string[], stamp: string): string {
  return (
    `These baked reads were written against an older data registry: ${names.join(', ')}. ` +
    `Re-check each against the current registry with the noon-sql-analyst skill (skill/SKILL.md) ` +
    `and re-stamp it with the current registry stamp (${stamp}) from /__synapse/registry/status.`
  );
}

// A QUIET notice in the KitUpdateNotice pattern: renders only when at least one read's stamp is
// verifiably older than the registry being served ('stale'); 'ok' and 'unknown' (unstamped or
// pre-stamp formats like "v2.21") render nothing, as does any fetch failure. Never a red check.
function StaleReadsNotice({ registry }: { registry: LoadState<RegistryFreshnessPayload> }) {
  if (registry.status !== 'ready' || !registry.data.stamp) return null;
  const stale = (registry.data.reads ?? []).filter((r) => r.verdict === 'stale');
  if (stale.length === 0) return null;
  return (
    <Card className="border-slate-200 bg-slate-50/60">
      <h3 className="text-sm font-semibold text-slate-700">
        {stale.length === 1
          ? '1 read predates the current data registry'
          : `${stale.length} reads predate the current data registry`}
      </h3>
      <p className="mt-1 text-sm text-slate-600">
        The registry has changed since {stale.length === 1 ? 'this read was' : 'these reads were'}{' '}
        baked ({stale.map((r) => r.title).join(', ')}). Nothing is necessarily broken — when you're
        ready, paste this to your agent to re-check {stale.length === 1 ? 'it' : 'them'}:
      </p>
      <div className="mt-2">
        <CopyBox
          text={buildStaleReadsMessage(
            stale.map((r) => r.name),
            registry.data.stamp,
          )}
          wrap
        />
      </div>
    </Card>
  );
}

// A QUIET notice, deliberately not a checklist row: an available update never turns anything
// red, and any failure to check (offline, GitHub down) means this renders nothing at all.
function KitUpdateNotice({ kit }: { kit: LoadState<Kit> }) {
  if (kit.status !== 'ready' || !kit.data.updateAvailable || !kit.data.latest) return null;
  return (
    <Card className="border-slate-200 bg-slate-50/60">
      <h3 className="text-sm font-semibold text-slate-700">
        Kit update available ({kit.data.latest})
      </h3>
      <p className="mt-1 text-sm text-slate-600">
        The starter kit this app was built from has improved
        {kit.data.local ? ` since version ${kit.data.local}` : ''}. Nothing is broken — when you're
        ready, paste this to your agent and it upgrades the kit without touching your app's pages:
      </p>
      <div className="mt-2">
        <CopyBox text={buildKitUpdateMessage(kit.data.latest)} wrap />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Kickoff prompt
// ---------------------------------------------------------------------------

function KickoffCard() {
  return (
    <Card className="border-indigo-200 bg-indigo-50/50">
      <h3 className="text-sm font-semibold text-indigo-900">
        Kickoff prompt — start your first build
      </h3>
      <p className="mt-1 text-sm text-indigo-800">
        Replace the first line with what you want, then paste it into the Agent chat in Replit — the
        panel where you typed to build this app.
      </p>
      <div className="mt-2">
        <CopyBox text={buildKickoffPrompt()} wrap />
      </div>
    </Card>
  );
}

function SecondaryCard({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-900">{title}</span>
        <span aria-hidden className="text-slate-300 group-hover:text-indigo-500">
          →
        </span>
      </span>
      <span className="mt-1 block text-sm text-slate-500">{children}</span>
    </button>
  );
}
