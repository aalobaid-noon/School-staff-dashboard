import { relativeTime } from '../../format';
import { useView, type ViewData } from '../../useView';
import { AppCard, AppEmptyState, DataTable } from '../ui';

// A registered view (baked read) rendered as a live data block in the shipped app — the ready-made
// table built on the useView data-in primitive. It's the building block app pages compose; when you
// want a custom UI over the same data (a chart, a game board), call useView directly instead. Copy
// stays end-user-friendly (no secret names, no console jargon), and styling comes entirely from the
// theme.css tokens (via the app/ui.tsx primitives) — never hardcode colors here.
export function ViewBlock({ name }: { name: string }) {
  const state = useView(name);

  return (
    <AppCard>
      {state.status === 'loading' && <p className="text-body text-ink-muted">Loading…</p>}
      {state.status === 'error' && (
        <AppEmptyState>This data isn't available right now.</AppEmptyState>
      )}
      {state.status === 'ready' && <ViewBlockBody view={state.data} />}
    </AppCard>
  );
}

// The four reasons a block has nothing to draw, kept DISTINCT on purpose. Collapsing them into one
// "Nothing to show here yet" is how a broken app gets mistaken for a quiet week: an empty result is
// often correct (a new campus, a holiday), while a missing secret or a failed query needs someone
// to act. The builder can only tell those apart if the block says which one happened.
function unavailableReason(view: ViewData): string | null {
  if (!view.configured) return "This isn't connected to Noon data yet.";
  if (view.error !== null) return "This couldn't load just now. Try again in a moment.";
  if (view.columns.length === 0 || view.rows.length === 0) return 'No data for this period yet.';
  return null;
}

function ViewBlockBody({ view }: { view: ViewData }) {
  const unavailable = unavailableReason(view);

  return (
    <div className="min-w-0">
      <h3 className="text-body font-semibold text-ink">{view.title}</h3>
      <p className="text-body text-ink-muted">{view.description}</p>
      {view.configured && view.dataAsOf !== null && (
        <p className="mt-1 text-caption text-ink-faint">Updated {relativeTime(view.dataAsOf)}</p>
      )}

      <div className="mt-4">
        {unavailable !== null ? (
          <AppEmptyState>{unavailable}</AppEmptyState>
        ) : (
          <>
            {view.truncated && (
              <p className="mb-2 text-caption text-warning">
                Showing the first {view.rows.length.toLocaleString()} rows.
              </p>
            )}
            <DataTable columns={view.columns} rows={view.rows} />
          </>
        )}
      </div>
    </div>
  );
}
