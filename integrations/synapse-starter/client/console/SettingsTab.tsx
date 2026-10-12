import type { ReactNode } from 'react';
import { Card, Pill, SectionHeading } from '../ui';
import { type LoadState, useJson } from '../useJson';

// Mirrors server/overview.ts OverviewProjection (served by /__synapse/overview).
interface Overview {
  appId: string | null;
  baseUrl: string;
  configured: boolean;
  configError: string | null;
  connection: { ok: boolean; detail: string };
}

// How your app connects to Noon — the connection details that used to be a disclosure on Home, now
// a first-class section. Read-only: the secrets themselves live in Replit's Secrets pane.
export function SettingsTab() {
  const overview = useJson<Overview>('/__synapse/overview');

  return (
    <section className="space-y-4">
      <SectionHeading title="Settings">How your app connects to Noon.</SectionHeading>
      <ConnectionSettings overview={overview} />
    </section>
  );
}

function ConnectionSettings({ overview }: { overview: LoadState<Overview> }) {
  if (overview.status === 'loading') {
    return <p className="text-sm text-slate-500">Loading your connection…</p>;
  }
  if (overview.status === 'error') {
    return <p className="text-sm text-rose-600">Couldn't load your settings: {overview.message}</p>;
  }

  const o = overview.data;
  return (
    <div className="space-y-4">
      <Card>
        {o.connection.ok ? (
          <Pill tone="good">Connected to Noon</Pill>
        ) : (
          <Pill tone="warn">Setup needed</Pill>
        )}
        <p className="mt-2 text-sm text-slate-600">
          {o.connection.ok ? (
            o.connection.detail
          ) : o.configured ? (
            o.connection.detail
          ) : (
            <>
              Add your Noon keys in Replit's <strong>Secrets</strong> (
              <code className="font-mono text-xs">SYNAPSE_APP_ID</code> and{' '}
              <code className="font-mono text-xs">SYNAPSE_APP_SECRET</code>), then press{' '}
              <strong>Run</strong> again.
            </>
          )}
        </p>
        {o.configError && <p className="mt-1 text-sm text-slate-500">{o.configError}</p>}
      </Card>

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="App ID">
          {o.appId ? (
            <span className="font-mono text-xs">{o.appId}</span>
          ) : (
            <span className="text-slate-400">not set</span>
          )}
        </Field>
        <Field label="Citadel base URL">
          <span className="break-all font-mono text-xs">{o.baseUrl}</span>
        </Field>
      </dl>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-800">{children}</dd>
    </div>
  );
}
