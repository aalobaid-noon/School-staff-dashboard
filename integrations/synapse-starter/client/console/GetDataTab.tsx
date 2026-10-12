import { type ReactNode, useMemo, useState } from 'react';
import { Button, Card, CopyBox, Disclosure, EmptyState, Pill, SectionHeading } from '../ui';
import { type LoadState, useJson } from '../useJson';
import type { TabId } from './ConsoleApp';

// Mirrors server/tables.ts TableProjection (the JSON shape served by /__synapse/tables).
interface TableColumn {
  name: string;
  type: string;
  description: string;
  enumValues?: string[];
}
export interface TableProjection {
  key: string;
  database: string;
  table: string;
  description: string;
  grain: string;
  refreshCadence: string;
  accessLevel: string;
  columns: TableColumn[];
  exampleQueries: string[];
}

interface Overview {
  configured: boolean;
  connection: { ok: boolean };
}

// Mirrors server/registry.ts RegistryStatus (served by /__synapse/registry/status, which also
// appends per-read staleness verdicts — see HomeTab's stale-reads notice). `stamp` is the
// app-computed content stamp (server/registry.ts registryStamp) an agent copies verbatim into a
// baked read's `registryVersion`; optional here so the label degrades on any older payload.
interface RegistryStatus {
  source: 'live' | 'snapshot';
  reason: 'no-secrets' | 'not-deployed' | 'unreachable' | null;
  liveVersion: string | null;
  liveLastModified: string | null;
  snapshotLastUpdated: string | null;
  stamp?: string;
}

// The freshness line under "browse all Noon data". One sentence, quiet, never an error state —
// the table browser above renders the live registry when the source is live, else the snapshot
// (server/registryParse.ts), and this label reports which. The trailing stamp is the same token
// /__synapse/registry/status serves — the one identity a baked read is stamped with. Exported
// for unit testing. Returns null when the status is unrecognized (render nothing).
export function buildFreshnessLabel(s: RegistryStatus): string | null {
  const stamp = s.stamp ? ` Registry stamp ${s.stamp}.` : '';
  if (s.source === 'live') {
    const version = s.liveVersion ? ` ${s.liveVersion}` : '';
    const date = s.liveLastModified ? ` · updated ${s.liveLastModified}` : '';
    return `Live registry${version}${date} — this browser matches what Citadel serves today.${stamp}`;
  }
  if (s.source !== 'snapshot') return null;
  const dated = s.snapshotLastUpdated ? ` (dated ${s.snapshotLastUpdated})` : '';
  switch (s.reason) {
    case 'not-deployed':
      // Day-one reality on staging: nothing to be behind, so no staleness alarm.
      return `Built-in snapshot${dated} — the live registry isn't available on this Citadel yet.${stamp}`;
    case 'no-secrets':
      return `Snapshot${dated} — may be stale. Add your Noon keys to check the live registry.${stamp}`;
    default:
      return `Snapshot${dated} — may be stale. Couldn't reach the live registry.${stamp}`;
  }
}

// ---------------------------------------------------------------------------
// Prompt builders (the model-A hand-off to the Replit build agent)
// ---------------------------------------------------------------------------

// The Home/Get-data composer is DESCRIBE-ONLY: it never guesses a table. The agent's SQL skill
// is explicitly mandated to pick the table from the registry (skill/SKILL.md), so naming a
// guessed table here would only mislead. Exported for unit testing.
export function buildRequestPrompt(want: string): string {
  const ask = want.trim() || '(describe what you want to see)';
  return [
    `Build me a page that shows: ${ask}`,
    '',
    'Follow AGENTS.md — use the SQL skill to pick the right Noon table from the registry, bake ' +
      'it as a read in server/queries run through synapse.athenaQuery (app-wide, no raw fetch, no ' +
      'per-user scope), and register it so it shows under my views.',
  ].join('\n');
}

// Used only when the builder is DELIBERATELY browsing a specific table and clicks "Use this in
// my app" — a chosen anchor, not a guess. Scopes the prompt to that table. Exported for testing.
export function buildAgentPrompt(tableName: string, want: string): string {
  const ask = want.trim() || '(describe what you want to see here)';
  return [
    `Using the \`${tableName}\` table, build me a page that shows: ${ask}`,
    '',
    'Follow AGENTS.md: bake this as a read in server/queries (a baked SELECT run through ' +
      'synapse.athenaQuery — app-wide, no raw fetch, no per-user scope) and register it so it ' +
      'shows under my views.',
  ].join('\n');
}

// Match a plain-English query against the fields a builder would search by. Exported for testing.
export function filterTables(tables: TableProjection[], query: string): TableProjection[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return tables;
  }
  return tables.filter((t) => {
    const haystack = [t.key, t.table, t.database, t.description, ...t.columns.map((c) => c.name)]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}

// ---------------------------------------------------------------------------
// Get data — the core journey
// ---------------------------------------------------------------------------

export function GetDataTab({ onNavigate }: { onNavigate: (tab: TabId) => void }) {
  const overview = useJson<Overview>('/__synapse/overview');
  const tables = useJson<TableProjection[]>('/__synapse/tables');
  const registry = useJson<RegistryStatus>('/__synapse/registry/status');

  const secretsMissing =
    overview.status === 'ready' && (!overview.data.configured || !overview.data.connection.ok);

  return (
    <section className="space-y-8">
      <Composer onNavigate={onNavigate} secretsMissing={secretsMissing} />

      <Disclosure summary="Or browse all Noon data yourself">
        <div className="mt-1">
          <RegistryFreshness registry={registry} />
          <DataBrowser tables={tables} />
        </div>
      </Disclosure>
    </section>
  );
}

// Quiet one-liner on the registry's source + a raw-text affordance. Renders nothing while
// loading, on error, or on an unrecognized payload — freshness must never break browsing.
function RegistryFreshness({ registry }: { registry: LoadState<RegistryStatus> }) {
  if (registry.status !== 'ready') return null;
  const label = buildFreshnessLabel(registry.data);
  if (!label) return null;
  return (
    <p className="mb-3 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
      <Pill tone={registry.data.source === 'live' ? 'good' : 'neutral'}>
        {registry.data.source === 'live' ? 'live' : 'snapshot'}
      </Pill>
      <span>{label}</span>
      <a
        href="/__synapse/registry"
        target="_blank"
        rel="noreferrer"
        className="font-medium text-indigo-600 hover:text-indigo-800"
      >
        view raw registry →
      </a>
    </p>
  );
}

function Composer({
  onNavigate,
  secretsMissing,
}: {
  onNavigate: (tab: TabId) => void;
  secretsMissing: boolean;
}) {
  const [want, setWant] = useState('');
  const trimmed = want.trim();
  const request = trimmed ? buildRequestPrompt(want) : '';

  return (
    <div className="space-y-4">
      <SectionHeading title="Get Noon data into your app">
        Describe what you'd like to see — like you'd tell a teammate. We write the request; the
        Replit agent builds the page for you.
      </SectionHeading>

      {secretsMissing && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          You can set this up now — your page will show data once you add your Noon keys in Replit's
          Secrets.
        </p>
      )}

      <div>
        <label htmlFor="composer-want" className="text-sm font-medium text-slate-700">
          What data do you want to see?
        </label>
        <textarea
          id="composer-want"
          value={want}
          onChange={(e) => setWant(e.target.value)}
          rows={3}
          placeholder="e.g. how many students attended live sessions last week"
          className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30"
        />
      </div>

      {request ? (
        <RequestResult request={request} onNavigate={onNavigate} />
      ) : (
        <Button disabled>Write my request for the builder</Button>
      )}
    </div>
  );
}

function RequestResult({
  request,
  onNavigate,
}: {
  request: string;
  onNavigate: (tab: TabId) => void;
}) {
  return (
    <Card className="border-indigo-200 bg-indigo-50/50">
      <h3 className="text-sm font-semibold text-indigo-900">
        Your request — paste it to the Replit agent
      </h3>
      <div className="mt-2">
        <CopyBox text={request} wrap />
      </div>

      <ol className="mt-4 space-y-2 text-sm text-slate-700">
        <Step n={1}>Copy the request above.</Step>
        <Step n={2}>
          Paste it into the Agent chat in Replit — the panel where you typed to build this app.
        </Step>
        <Step n={3}>
          It writes the query and adds your page under “Your views”. Come back in a minute; it takes
          a moment while the app rebuilds.
        </Step>
      </ol>

      <button
        type="button"
        onClick={() => onNavigate('views')}
        className="mt-3 text-sm font-medium text-indigo-700 hover:text-indigo-900"
      >
        Go to Your views →
      </button>
    </Card>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-medium text-white">
        {n}
      </span>
      <span className="leading-relaxed">{children}</span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Browse all Noon data (the schema reference — power-user, behind a disclosure)
// ---------------------------------------------------------------------------

function DataBrowser({ tables }: { tables: LoadState<TableProjection[]> }) {
  if (tables.status === 'loading') {
    return <p className="text-sm text-slate-500">Loading the data registry…</p>;
  }
  if (tables.status === 'error') {
    return <p className="text-sm text-rose-600">Couldn't load the registry: {tables.message}</p>;
  }
  return <DataBrowserList tables={tables.data} />;
}

function DataBrowserList({ tables }: { tables: TableProjection[] }) {
  const [query, setQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(tables[0]?.key ?? null);

  const filtered = useMemo(() => filterTables(tables, query), [tables, query]);
  const selected = filtered.find((t) => t.key === selectedKey) ?? filtered[0] ?? null;

  return (
    <div>
      <p className="mb-3 text-sm text-slate-500">
        Every set of Noon data your app can pull from ({tables.length} in total). Browsing is
        optional — the agent finds the right one for you from your description above.
      </p>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search data and fields…"
        aria-label="Search data"
        className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30"
      />

      {filtered.length === 0 ? (
        <EmptyState>No data matches “{query}”.</EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[18rem_minmax(0,1fr)]">
          <ul className="min-w-0 max-h-64 overflow-y-auto rounded-lg border border-slate-200 md:max-h-[28rem]">
            {filtered.map((t) => (
              <li key={t.key}>
                <button
                  type="button"
                  onClick={() => setSelectedKey(t.key)}
                  className={`block w-full border-b border-slate-100 px-3 py-2 text-left text-sm last:border-b-0 ${
                    selected?.key === t.key
                      ? 'bg-slate-100 font-medium text-slate-900'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="block truncate">{t.table}</span>
                  <span className="block truncate text-xs text-slate-400">{t.description}</span>
                </button>
              </li>
            ))}
          </ul>

          {selected && <TableDetail key={selected.key} table={selected} />}
        </div>
      )}
    </div>
  );
}

const ACCESS_LABEL: Record<string, string> = {
  all: 'Anyone in your app can see this',
  leader_and_above: 'Leaders & above',
  admin_only: 'Admins only',
};

function TableDetail({ table }: { table: TableProjection }) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">{table.table}</h3>
        <Pill
          tone="neutral"
          title="Informational only — reads run app-wide. This reflects the registry's documented sensitivity, not an enforced limit."
        >
          {ACCESS_LABEL[table.accessLevel] ?? table.accessLevel}
        </Pill>
      </div>
      <p className="mt-1 text-sm text-slate-600">{table.description}</p>

      <UseInAppPanel table={table} />

      <div className="mt-4">
        <Disclosure summary="Peek inside this data">
          <dl className="grid grid-cols-1 gap-1 text-xs text-slate-500 sm:grid-cols-2">
            <div>
              <dt className="inline font-medium text-slate-600">What each row is: </dt>
              <dd className="inline">{table.grain}</dd>
            </div>
            <div>
              <dt className="inline font-medium text-slate-600">Updated: </dt>
              <dd className="inline">{table.refreshCadence}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="inline font-medium text-slate-600">Full name: </dt>
              <dd className="inline font-mono">
                {table.database}.{table.table}
              </dd>
            </div>
          </dl>

          <h4 className="mt-4 text-xs font-medium text-slate-500">
            Fields ({table.columns.length})
          </h4>
          {/* Stacked (not a wide table) so descriptions always wrap into view — no
              horizontal scroll, and it reads cleanly on a phone. */}
          <ul className="mt-2 max-h-72 min-w-0 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-100">
            {table.columns.map((col) => (
              <li key={col.name} className="px-3 py-2">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-mono text-xs text-slate-800">{col.name}</span>
                  <span className="font-mono text-[11px] text-slate-400">{col.type}</span>
                </div>
                {col.description && (
                  <p className="mt-0.5 break-words text-xs text-slate-600">{col.description}</p>
                )}
                {col.enumValues && col.enumValues.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {col.enumValues.map((v) => (
                      <span
                        key={v}
                        className="break-words rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600"
                      >
                        {v}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>

          {table.exampleQueries.length > 0 && (
            <>
              <h4 className="mt-4 text-xs font-medium text-slate-500">Example queries</h4>
              <div className="mt-2 space-y-2">
                {table.exampleQueries.map((sql) => (
                  <CopyBox key={sql} text={sql} />
                ))}
              </div>
            </>
          )}
        </Disclosure>
      </div>
    </div>
  );
}

// The deliberate, table-scoped hand-off (a chosen anchor). Empty by default — no pre-filled SQL.
function UseInAppPanel({ table }: { table: TableProjection }) {
  const [open, setOpen] = useState(false);
  const [want, setWant] = useState('');
  const trimmed = want.trim();

  return (
    <div className="mt-3">
      <Button onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        Use this in my app
      </Button>

      {open && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <label htmlFor="use-in-app-want" className="text-xs font-medium text-slate-700">
            What do you want from this data?
          </label>
          <p className="mt-0.5 text-xs text-slate-500">
            Describe it in plain English. We'll write a request — scoped to this data — for the
            Replit agent.
          </p>
          <textarea
            id="use-in-app-want"
            value={want}
            onChange={(e) => setWant(e.target.value)}
            rows={3}
            placeholder="e.g. total time each student spent in live sessions"
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30"
          />

          {trimmed && (
            <>
              <p className="mt-3 text-xs font-medium text-slate-700">
                Paste this to the Replit agent (chat):
              </p>
              <div className="mt-1">
                <CopyBox text={buildAgentPrompt(table.table, want)} wrap />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
