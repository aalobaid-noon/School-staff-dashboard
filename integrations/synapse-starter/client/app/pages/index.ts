// Registry of app pages, keyed by route path. Adding a page = adding a client/app/pages/<name>.tsx
// file and registering it here; the app shell renders it and lists it in the nav automatically.
// This mirrors server/queries/index.ts (the baked-reads registry) so the builder/agent extends the
// product the same disciplined way it extends reads.

import type { ReactNode } from 'react';
import * as home from './home';
import * as synapse from './synapse';

export interface AppPage {
  path: string;
  title: string;
  nav: boolean;
  Page: () => ReactNode;
}

// What every client/app/pages/<name>.tsx module exports (the file-plus-registry convention).
interface AppPageModule {
  path: string;
  title: string;
  nav: boolean;
  Page: () => ReactNode;
}

function toAppPage(m: AppPageModule): AppPage {
  return { path: m.path, title: m.title, nav: m.nav, Page: m.Page };
}

// Null-prototype map so a request for an inherited key (e.g. `__proto__`) resolves to undefined
// instead of Object.prototype — otherwise getPageForPath would treat it as a hit.
export const APP_PAGES: Record<string, AppPage> = Object.assign(Object.create(null), {
  [home.path]: toAppPage(home),
  // Synapse's frozen scaffolding corner (footer link only — its nav flag stays false).
  [synapse.path]: toAppPage(synapse),
});

export function listAppPages(): AppPage[] {
  return Object.values(APP_PAGES);
}

// Resolve a URL path to its page, falling back to the home page ('/') for unknown paths.
export function getPageForPath(path: string): AppPage | null {
  return APP_PAGES[path] ?? APP_PAGES['/'] ?? null;
}
