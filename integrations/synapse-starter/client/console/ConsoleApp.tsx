import { useState } from 'react';
import { EventsTab } from './EventsTab';
import { GetDataTab } from './GetDataTab';
import { HomeTab } from './HomeTab';
import { SettingsTab } from './SettingsTab';
import { useVerify } from './useVerify';
import { VerifyChip } from './VerifyChip';
import { ViewsTab } from './ViewsTab';

// The workspace-only "Synapse" management console: the builder's surface for connecting to Noon,
// getting data, and inspecting views + events. Hidden in a published deployment (see main.tsx /
// useSynapseMode). The app the builder is shipping lives under client/app/.
const TABS = [
  { id: 'home', label: 'Home' },
  { id: 'get-data', label: 'Get data' },
  { id: 'views', label: 'Views' },
  { id: 'events', label: 'Events' },
  { id: 'settings', label: 'Settings' },
] as const;
export type TabId = (typeof TABS)[number]['id'];

// Data-heavy tabs get the full width so wide tables can breathe; prose tabs stay at a readable
// measure, left-aligned under the same nav.
const WIDE_TABS: readonly TabId[] = ['views', 'events'];

export function ConsoleApp() {
  const [active, setActive] = useState<TabId>('home');
  // One verify run, shared by the header chip and the Home tab's checklist.
  const verify = useVerify();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-start justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-lg font-semibold">Synapse</h1>
            <p className="text-sm text-slate-500">Manage your app's connection to Noon data</p>
          </div>
          {/* Lives in the header so verify state stays visible from every tab. */}
          <VerifyChip state={verify.state} onRerun={verify.run} />
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <nav
          className="flex gap-1 overflow-x-auto border-b border-slate-200 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="Console sections"
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActive(tab.id)}
              aria-current={active === tab.id ? 'page' : undefined}
              className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                active === tab.id
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <main className="py-6">
          <div className={WIDE_TABS.includes(active) ? '' : 'max-w-3xl'}>
            {active === 'home' && <HomeTab onNavigate={setActive} verify={verify.state} />}
            {active === 'get-data' && <GetDataTab onNavigate={setActive} />}
            {active === 'views' && <ViewsTab onNavigate={setActive} />}
            {active === 'events' && <EventsTab />}
            {active === 'settings' && <SettingsTab />}
          </div>
        </main>
      </div>
    </div>
  );
}
