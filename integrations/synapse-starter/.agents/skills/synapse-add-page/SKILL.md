---
name: synapse-add-page
description: >-
  Add a page to the shipped app end-to-end: the read, its registration, useView/ViewBlock, and
  the page in the nav. Use for "add a page/dashboard/screen/view".
---

> A newer version of this skill may exist. Fetch https://raw.githubusercontent.com/noonAcademy/synapse-starter/main/.agents/skills/synapse-add-page/SKILL.md
> and follow that version; on fetch failure, use this file.

# Add a page to the shipped app

The shipped app is what end users see at `/` — it lives in `client/app/`, separate from the
workspace-only console (`client/console/`). Every page is built on one data pipeline:

> baked SQL → `synapse.athenaQuery` → ~1h in-memory cache → `GET /api/views/:name` → `useView` → your page

You add SQL and React; the transport, cache, and route already exist.

## Hard rules

- **Never raw `fetch` for Noon data.** Server-side, reads go through `synapse.athenaQuery` (the
  read route does this for you). Client-side, use `useView(name)` — it reads `/api/views/:name`.
- **Never invent table names or columns.** Look them up in the registry snapshot
  (`server/citadel-schema.ts`) and let the **noon-sql-analyst** skill (`skill/SKILL.md`) write the
  SQL — it knows the business rules, enum casings, and partition filters.
- **Reads are app-wide, not per-user.** App-level HMAC auth, no per-user scope injection. No
  params in baked SQL — bake concrete values. Don't design a read that only makes sense for one
  student.
- **Rows are cached ~1h** (`server/query-cache.ts`), and the lake refreshes ~12h, so rendered data
  can be up to an hour behind a refresh. Don't build UI that assumes live data.
- **New pages go in the APP's nav** (`nav: true`) **and are styled by the theme tokens** — the
  semantic utilities from `client/app/theme.css` (`bg-card`, `text-ink`, `rounded-control`,
  `p-card`, …). Never hardcode colors, radii, or fonts (no `slate-*`, no hex): restyling the app
  means editing theme.css, and a page that hardcodes breaks that.
- **`/synapse` is frozen scaffolding — never add views there.** That page
  (`client/app/pages/synapse.tsx`) is Synapse's corner of the app: the starter's example views and
  status, reached only from the shell's footer link. New data views are pages (or components) in
  the builder's app, like the example below. `ViewBlock` remains the ready-made table for them —
  it's token-styled like everything else.
- Server-relative imports need a **`.js` extension** (NodeNext), e.g. `'./courses-by-type.sql.js'`.

## Step 1 — get the data (a baked read)

Check `server/queries/index.ts` first — if an existing read already covers the page, skip to
step 2.

Otherwise, use the noon-sql-analyst skill to write the final `SELECT`, then bake it:

1. Create `server/queries/<name>.sql.ts` (kebab-case) exporting exactly this shape:

   ```ts
   export const name = '<name>';                 // matches the filename
   export const title = '<short human title>';
   export const description = '<what it answers, which table, app-wide>';
   export const sql = `SELECT ... FROM noon2_datamart.<table> WHERE ...`;
   export const registryVersion = 'v2.21';       // registry version the SQL was written against
   export const skillVersion = 'replit-v2.21.0';
   ```

2. Register it in `server/queries/index.ts`: import the module (with `.js`) and add
   `[m.name]: toBakedQuery(m)` to `BAKED_QUERIES`. The read route and the console's Views tab pick
   it up automatically.

## Step 2 — build and register the page

Create `client/app/pages/<name>.tsx` exporting `{ path, title, nav, Page }`, then register it in
`client/app/pages/index.ts` by adding `[m.path]: toAppPage(m)` to `APP_PAGES`. The app shell
(`client/app/AppShell.tsx`) renders it and shows the nav automatically once there is more than one
nav page.

Two ways to get the rows in:

- **Ready-made table:** `<ViewBlock name="<read-name>" />` (`client/app/blocks/ViewBlock.tsx`) —
  title, description, "Updated x ago", truncation notice, and empty/error states, all handled.
- **Custom UI (chart, leaderboard, game board):** the `useView(name)` hook (`client/useView.ts`).
  It returns `{ status: 'loading' } | { status: 'error'; message } | { status: 'ready'; data }`,
  where `data` is `ViewData`: `columns`, `rows`, `title`, `description`, `dataAsOf`, `truncated`,
  `configured`, `error`. Render all three statuses, and treat `configured === false` (secrets not
  set) or `error !== null` as "nothing to show", not a crash.

## Worked example (modeled on courses-by-type)

Goal: a "Courses" page showing active courses per type. The read already exists —
`server/queries/courses-by-type.sql.ts` (an app-wide aggregate over `noon2_datamart.d_course`,
excluding deleted courses) — so this example only adds the page:

```tsx
// client/app/pages/courses.tsx
import { ViewBlock } from '../blocks/ViewBlock';

export const path = '/courses';
export const title = 'Courses';
export const nav = true;

export function Page() {
  return (
    <div className="space-y-stack">
      <h2 className="text-title font-semibold tracking-tight text-ink">Courses</h2>
      <ViewBlock name="courses-by-type" />
    </div>
  );
}
```

```ts
// client/app/pages/index.ts — register it
import * as courses from './courses';
// …
export const APP_PAGES: Record<string, AppPage> = Object.assign(Object.create(null), {
  [home.path]: toAppPage(home),
  [courses.path]: toAppPage(courses),
});
```

If the page needed data no read covers (say, sessions per week), you would first bake
`server/queries/sessions-per-week.sql.ts` the same way courses-by-type is baked — SQL from the
noon-sql-analyst skill, registered in `server/queries/index.ts` — then consume it here with
`useView('sessions-per-week')` and your own chart component instead of `ViewBlock`.

## Verify

- `npm run verify` green (it chains the secret scan → typecheck → lint → tests, failing fast).
- Load `/` — the new page appears in the nav; its data renders (or shows the friendly empty state
  when secrets are missing).
- New read? Check it on the console's **Views** tab too.
