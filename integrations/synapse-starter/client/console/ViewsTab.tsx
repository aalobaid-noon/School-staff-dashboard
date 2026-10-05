import { useState } from 'react';
import { relativeTime } from '../format';
import { RowsTable } from '../RowsTable';
import { Button, Disclosure, EmptyState, SectionHeading } from '../ui';
import { useJson } from '../useJson';
import type { TabId } from './ConsoleApp';

interface ReadListItem {
  name: string;
  title: string;
  description: string;
}
// Mirrors server/reads.ts ReadResult (served by /__synapse/reads/:name).
interface ReadResult {
  name: string;
  title: string;
  description: string;
  sql: string;
  registryVersion: string;
  skillVersion: string;
  columns: string[];
  rows: Record<string, unknown>[];
  truncated: boolean;
  dataAsOf: string | null;
  cached: boolean;
  configured: boolean;
  error: string | null;
}

// Every baked read, listed from /__synapse/reads (closes the loop: a read the agent adds at build
// time shows up here automatically). Redesigned from the old cramped sidebar into a top picker +
// full-width detail so wide data tables have room to breathe.
export function ViewsTab({ onNavigate }: { onNavigate: (tab: TabId) => void }) {
  const list = useJson<ReadListItem[]>('/__synapse/reads');
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      <SectionHeading title="Your views">
        Pages in your app that show live Noon data.
      </SectionHeading>

      {list.status === 'loading' && <p className="text-sm text-slate-500">Loading your views…</p>}
      {list.status === 'error' && (
        <p className="text-sm text-rose-600">Couldn't load your views: {list.message}</p>
      )}

      {list.status === 'ready' &&
        (list.data.length === 0 ? (
          <EmptyState>
            <p>No views yet.</p>
            <div className="mt-3">
              <Button onClick={() => onNavigate('get-data')}>Make your first one →</Button>
            </div>
          </EmptyState>
        ) : (
          <ViewsBrowser
            views={list.data}
            selected={selected ?? list.data[0]?.name ?? null}
            onSelect={setSelected}
          />
        ))}
    </div>
  );
}

function ViewsBrowser({
  views,
  selected,
  onSelect,
}: {
  views: ReadListItem[];
  selected: string | null;
  onSelect: (name: string) => void;
}) {
  // One view: skip the picker and just render it full-width.
  if (views.length === 1 && views[0]) {
    return <ViewDetail name={views[0].name} />;
  }
  return (
    <div className="space-y-4">
      <ViewPicker views={views} selected={selected} onSelect={onSelect} />
      {selected && <ViewDetail key={selected} name={selected} />}
    </div>
  );
}

// A few views: selectable cards that wrap. Many: a compact dropdown. Either way the picker sits
// ABOVE the detail instead of stealing horizontal space from the data table beside it.
function ViewPicker({
  views,
  selected,
  onSelect,
}: {
  views: ReadListItem[];
  selected: string | null;
  onSelect: (name: string) => void;
}) {
  if (views.length > 8) {
    return (
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Choose a view</span>
        <select
          value={selected ?? ''}
          onChange={(e) => onSelect(e.target.value)}
          className="mt-1.5 block w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30"
        >
          {views.map((v) => (
            <option key={v.name} value={v.name}>
              {v.title}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {views.map((v) => {
        const active = v.name === selected;
        return (
          <button
            key={v.name}
            type="button"
            onClick={() => onSelect(v.name)}
            aria-current={active ? 'true' : undefined}
            className={`w-full min-w-0 rounded-lg border px-3 py-2 text-left transition-colors sm:w-64 ${
              active
                ? 'border-indigo-300 bg-indigo-50'
                : 'border-slate-200 bg-white hover:bg-slate-50'
            }`}
          >
            <span className="block truncate text-sm font-medium text-slate-900">{v.title}</span>
            <span className="block truncate text-xs text-slate-400">{v.description}</span>
          </button>
        );
      })}
    </div>
  );
}

function ViewDetail({ name }: { name: string }) {
  const state = useJson<ReadResult>(`/__synapse/reads/${name}`);

  if (state.status === 'loading') {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }
  if (state.status === 'error') {
    return <p className="text-sm text-rose-600">Couldn't load this view: {state.message}</p>;
  }

  const read = state.data;
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">{read.title}</h3>
      <p className="text-sm text-slate-500">{read.description}</p>
      <Freshness read={read} />

      <div className="mt-4">
        {!read.configured ? (
          <EmptyState>
            Not connected yet — add your Noon keys (
            <code className="font-mono text-xs">SYNAPSE_APP_ID</code> and{' '}
            <code className="font-mono text-xs">SYNAPSE_APP_SECRET</code>) in Replit's Secrets, then
            press Run to load the data.
          </EmptyState>
        ) : read.error ? (
          <p className="text-sm text-rose-600">Couldn't fetch the data: {read.error}</p>
        ) : read.rows.length === 0 || read.columns.length === 0 ? (
          <EmptyState>This view came back empty — no rows to show right now.</EmptyState>
        ) : (
          <>
            {read.truncated && (
              <p className="mb-2 text-xs text-amber-700">
                Showing the first {read.rows.length.toLocaleString()} rows (there were more).
              </p>
            )}
            <RowsTable columns={read.columns} rows={read.rows} />
          </>
        )}
      </div>

      <div className="mt-4">
        <Disclosure summary="See the query behind this">
          <pre className="min-w-0 overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            {read.sql}
          </pre>
          <p className="mt-1 text-xs text-slate-400">
            registry {read.registryVersion} · skill {read.skillVersion} ·{' '}
            <code className="font-mono">server/queries/{read.name}.sql.ts</code>
          </p>
        </Disclosure>
      </div>
    </div>
  );
}

function Freshness({ read }: { read: ReadResult }) {
  if (!read.configured || read.dataAsOf === null) {
    return null;
  }
  return (
    <p className="mt-1 text-xs text-slate-400">
      Updated {relativeTime(read.dataAsOf)} · Noon refreshes this about twice a day.
    </p>
  );
}
