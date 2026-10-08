import type { PublishLogEntry } from '@noonacademy/synapse-sdk';
import { relativeTime } from '../format';
import { EmptyState, Pill, SectionHeading } from '../ui';
import { useJson } from '../useJson';

interface CatalogGroup {
  namespace: string;
  eventTypes: string[];
}
interface EventCatalog {
  total: number;
  groups: CatalogGroup[];
}

// Everything about events, in one place: what the app has actually sent (the activity log) and the
// catalog of what it can send. Both are first-class here — the catalog is no longer buried behind a
// disclosure the way it was on the old "My app" tab.
export function EventsTab() {
  return (
    <section className="space-y-10">
      <Activity />
      <div className="space-y-4">
        <SectionHeading title="Events your app can send" />
        <CatalogSection />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Activity — what your app has sent to Noon, in plain words.
// ---------------------------------------------------------------------------

function Activity() {
  const state = useJson<PublishLogEntry[]>('/__synapse/events');

  return (
    <div className="space-y-4">
      <SectionHeading title="What your app has sent">
        Events are things your app tells Noon about — like a student joining a course. This is what
        it has sent since it last started.
      </SectionHeading>

      {state.status === 'loading' && <p className="text-sm text-slate-500">Loading…</p>}
      {state.status === 'error' && (
        <p className="text-sm text-rose-600">Couldn't load this: {state.message}</p>
      )}
      {state.status === 'ready' &&
        (state.data.length === 0 ? (
          <EmptyState>Nothing sent yet. Events show up here once they go through.</EmptyState>
        ) : (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
            {state.data.map((event) => (
              <li
                key={`${event.at}-${event.type}-${event.status}-${event.eventId ?? event.error ?? ''}`}
                className="px-3 py-2.5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                    {event.type}
                  </span>
                  <EventStatus status={event.status} />
                  <span className="ml-auto text-xs text-slate-400">{relativeTime(event.at)}</span>
                </div>
                <EventDetailLine event={event} />
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}

function EventStatus({ status }: { status: PublishLogEntry['status'] }) {
  if (status === 'accepted') {
    return <Pill tone="good">Delivered</Pill>;
  }
  if (status === 'failed_permanent') {
    return <Pill tone="error">Couldn't deliver</Pill>;
  }
  return <Pill tone="warn">Didn't go through</Pill>;
}

function EventDetailLine({ event }: { event: PublishLogEntry }) {
  const parts: string[] = [];
  if (event.status === 'accepted' && event.eventId != null) {
    parts.push(`Noon ID #${event.eventId}`);
  }
  if (event.error) {
    parts.push(event.error);
  }
  if (event.attempts > 1) {
    parts.push(`${event.attempts} attempts`);
  }
  if (parts.length === 0) {
    return null;
  }
  return <p className="mt-1 break-words text-xs text-slate-400">{parts.join(' · ')}</p>;
}

// ---------------------------------------------------------------------------
// Events your app can send (the catalog).
// ---------------------------------------------------------------------------

function CatalogSection() {
  const state = useJson<EventCatalog>('/__synapse/catalog');

  if (state.status === 'loading') {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }
  if (state.status === 'error') {
    return <p className="text-sm text-rose-600">Couldn't load the catalog: {state.message}</p>;
  }

  const catalog = state.data;
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        These are the kinds of thing your app can tell Noon about.{' '}
        <strong className="font-medium text-slate-700">
          Need a new one? Just ask the Replit agent to build the feature that needs it
        </strong>{' '}
        — it defines and sends the event for you. Nothing to set up here. What your app has actually
        sent shows under{' '}
        <strong className="font-medium text-slate-700">“What your app has sent”</strong> above.
      </p>

      {catalog.groups.map((group) => (
        <div key={group.namespace}>
          <h4 className="text-sm font-medium text-slate-700">
            {group.namespace} <span className="text-slate-400">({group.eventTypes.length})</span>
          </h4>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {group.eventTypes.map((type) => (
              <span
                key={type}
                className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
              >
                {type}
              </span>
            ))}
          </div>
        </div>
      ))}

      <p className="text-xs text-slate-400">
        For developers: send one with{' '}
        <code className="font-mono">synapse.publishEvent(type, payload)</code>.
      </p>
    </div>
  );
}
