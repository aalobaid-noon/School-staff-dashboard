// Synapse's corner of the shipped app — FROZEN SCAFFOLDING, reached only from the shell's small
// footer link (never the primary nav; note `nav = false`). It hosts the starter's example views
// and the app's identity/connection status so they stay out of the builder's way. Never add new
// views here: new data views are pages (or components) in the builder's app (see the
// synapse-add-page skill).

import { type LoadState, useJson } from '../../useJson';
import { ViewBlock } from '../blocks/ViewBlock';
import { APP_NAME } from '../config';
import { AppCard } from '../ui';

export const path = '/synapse';

export const title = 'Synapse';

// Deliberately false, always: this page belongs to the starter, not the app.
export const nav = false;

// The slice of /__synapse/overview this page renders (full shape: server/overview.ts). The route
// exists ONLY in the workspace — in a published deployment the request falls through to the SPA
// catch-all and useJson reports an error, which is exactly how this page knows to hide the
// builder-only panel. Same probe philosophy as useSynapseMode, minus its ?surface escape hatch
// (a builder previewing with ?surface=app should still see the status panel).
interface Overview {
  appId: string | null;
  baseUrl: string;
  configured: boolean;
  connection: { ok: boolean; detail: string };
}

export function Page() {
  const overview = useJson<Overview>('/__synapse/overview');

  return (
    <div className="space-y-stack">
      <div className="space-y-1">
        <h2 className="text-title font-semibold tracking-tight text-ink">Synapse</h2>
        <p className="text-body text-ink-muted">
          The starter's corner of {APP_NAME} — scaffolding examples and connection status. The rest
          of the app belongs to its builder.
        </p>
      </div>

      <StatusCard overview={overview} />

      <div className="space-y-3">
        <div className="space-y-1">
          <h3 className="text-body font-semibold text-ink">Example views — Synapse scaffolding</h3>
          <p className="text-caption text-ink-muted">
            Frozen examples of the read pipeline, moved here from the home page. New data views
            belong in the app's own pages, not on this page.
          </p>
        </div>
        <ViewBlock name="courses-by-type" />
      </div>
    </div>
  );
}

// App identity, plus — in the workspace only — the live connection state and a link to the
// builder console. `overview` only ever loads where the workspace-only route is mounted, so in a
// published deployment this collapses to the identity line with no builder jargon.
function StatusCard({ overview }: { overview: LoadState<Overview> }) {
  const inWorkspace = overview.status === 'ready';

  return (
    <AppCard>
      <dl className="space-y-2 text-body">
        <div className="flex flex-wrap justify-between gap-x-6 gap-y-1">
          <dt className="text-ink-muted">App</dt>
          <dd className="font-medium text-ink">{APP_NAME}</dd>
        </div>
        <div className="flex flex-wrap justify-between gap-x-6 gap-y-1">
          <dt className="text-ink-muted">Environment</dt>
          <dd className="font-medium text-ink">
            {inWorkspace ? 'Workspace (builder console available)' : 'Published deployment'}
          </dd>
        </div>
        {inWorkspace && (
          <>
            <div className="flex flex-wrap justify-between gap-x-6 gap-y-1">
              <dt className="text-ink-muted">App ID</dt>
              <dd className="font-medium text-ink">{overview.data.appId ?? 'not set'}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-x-6 gap-y-1">
              <dt className="text-ink-muted">Connection</dt>
              <dd
                className={`font-medium ${overview.data.connection.ok ? 'text-success' : 'text-warning'}`}
              >
                {overview.data.connection.ok ? 'Connected' : 'Not connected'}
              </dd>
            </div>
          </>
        )}
      </dl>
      {inWorkspace && (
        <>
          <p className="mt-2 text-caption text-ink-faint">{overview.data.connection.detail}</p>
          <a
            href="/?surface=console"
            className="mt-4 inline-flex items-center gap-1 text-body font-medium text-accent hover:underline"
          >
            Open the builder console
          </a>
        </>
      )}
    </AppCard>
  );
}
