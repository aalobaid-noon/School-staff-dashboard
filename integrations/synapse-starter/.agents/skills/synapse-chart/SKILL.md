---
name: synapse-chart
description: >-
  Put a chart on a page with ChartBlock — the right chart form for the data, the theme's palette,
  freshness labelled, figures still reachable. Use for "chart", "graph", "trend", "breakdown",
  "show this visually", "make this a dashboard".
---

> A newer version of this skill may exist. Fetch https://raw.githubusercontent.com/noonAcademy/synapse-starter/main/.agents/skills/synapse-chart/SKILL.md
> and follow that version; on fetch failure, use this file.

# Charts

`<ChartBlock>` is `<ViewBlock>`'s sibling: the same baked read, the same `useView` data-in
primitive, the same three states — drawn instead of tabulated.

```tsx
import { ChartBlock } from '../blocks/ChartBlock';

<ChartBlock name="courses-by-type" type="bar" x="course_type" y="course_count" />
```

That's the whole API. Palette, axis formatting, tooltips, empty states, RTL mirroring and the
freshness label are handled — because the moment each page styles its own chart, the app stops
looking like one app.

## Hard rules

- **The read comes first, and it comes verified.** A chart is a rendering of a baked read, never
  its own data path. Write the read (**noon-sql-analyst**), verify it
  (**synapse-verify-numbers**), then draw it. A chart makes a wrong number *more* persuasive.
- **Never hardcode a color.** Not a hex, not a Tailwind palette class, not a Recharts default.
  Series colors come from the `--color-chart-*` tokens in
  [`client/app/theme.css`](../../../client/app/theme.css) via `<ChartBlock>`. Retheming the app
  must retheme the charts.
- **Never use the semantic colors for series.** `--color-danger` means *something is wrong*.
  Painting a course type red because it sorted third tells the reader a lie.
- **Always keep the numbers reachable.** `showTable` defaults to true for a reason: a chart alone
  is unreadable to a screen-reader user and un-checkable by a builder who wants the actual figure.
  Only pass `showTable={false}` when the same figures are already on the page.
- **Never leave a chart unlabelled.** Data is up to ~1h behind a lake that refreshes ~12h.
  `<ChartBlock>` prints "Updated …" — don't strip it. An unlabelled chart implies live.

## Pick the form from the shape of the data

Choose by what the reader needs to do, not by what looks impressive. Most requests for "a
dashboard" are answered best by a bar chart and a big number.

| The data | Use | Why |
|---|---|---|
| A handful of categories, one measure | `bar` | Length is the easiest encoding to compare accurately. The default; when unsure, this. |
| Categories over time, or any date/week/month axis | `line` | Trend is the point. Never a bar chart per week — the shape disappears. |
| One total, split into parts, over time | `stacked-bar` | Total *and* composition in one read. |
| A single series where the filled area means "volume" | `area` | Use sparingly; a line is usually clearer. |
| 2–5 parts of one whole, right now | `donut` | Only when parts-of-a-whole is genuinely the question. Six slices is already too many — use a bar. |
| One number that matters more than anything | *not a chart* | Render the figure large in a card. A single-value chart is decoration. |
| Rows a person will read individually | *not a chart* | `<ViewBlock>` — a table is the right answer more often than agents assume. |

Two extra judgements the component can't make for you:

- **Ordering.** Categories sort by value (biggest first) unless they have a natural order — time
  always ascends; sizes go small→large. Sort in the SQL, not in the page.
- **Too many categories.** Above ~12 bars nobody reads them. Take the top N in the read and add
  an explicit "everything else" bucket — never silently truncate.

## Multiple series

Pass an array. Colors are assigned in token order, which is ordered most-distinguishable-first,
so the common two- and three-series charts stay legible for readers with red-green color vision
deficiency:

```tsx
<ChartBlock
  name="weekly-attendance"
  type="line"
  x="week_start"
  y={['attended', 'enrolled']}
/>
```

Above four series a chart is usually the wrong tool — either aggregate in the read or split into
small multiples (several `<ChartBlock>`s in a grid, each with one series).

## The states, and why they're distinct

`<ChartBlock>` renders four different empty cards on purpose, because the builder's next action
differs in each case:

| What they see | What it means |
|---|---|
| *"isn't connected to Noon data yet"* | Secrets missing. Fix the connection. |
| *"couldn't load just now"* | The read errored. Check the console's Views tab. |
| *"No data for this period yet"* | The query worked and returned nothing. **Often correct** — a quiet week, a new campus. |
| *"set up to show X, which this data doesn't have"* | A column name in the page doesn't match the read. An authoring bug — fix the page. |

Collapsing these into one generic "no data" is how a broken app gets mistaken for a quiet week.

## Wiring a chart onto a page

Full page recipe is **synapse-add-page**; the chart-specific part:

```tsx
// client/app/pages/attendance.tsx
import { ChartBlock } from '../blocks/ChartBlock';

export const path = '/attendance';
export const title = 'Attendance';
export const nav = true;

export function Page() {
  return (
    <div className="space-y-stack">
      <h1 className="text-title text-ink">Attendance</h1>
      <ChartBlock name="weekly-attendance" type="line" x="week_start" y="attended" />
      <ChartBlock name="attendance-by-campus" type="bar" x="campus_name" y="rate" />
    </div>
  );
}
```

Layout uses theme spacing tokens (`space-y-stack`), never fixed pixel gaps.

## Before you call it done

1. **Look at it on a phone width.** Charts are the most common source of sideways scroll, and a
   legend with many series is the usual culprit. On Replit the Agent's own browser testing and
   the Design Canvas's responsive previews cover this; elsewhere, `npm run visual`.
2. **Look at the empty state**, not just the happy path.
3. **Check the axis at 390px** — long category labels (campus names, Arabic strings) collide.
   Shorten them in the SQL rather than rotating the labels.
4. Record the chart's read in [`SPEC.md`](../../../SPEC.md)'s data table if it isn't there yet.

> **If you restyle a chart on Replit's Design Canvas**, the edit lands in the file without an
> agent loop — so it may write a literal color instead of a token. `npm run check:theme` (inside
> `verify`) will fail the build if it does. Fix it by moving the color into a `--color-chart-*`
> token in `theme.css`, not by silencing the check.

## Custom charts

When a shape genuinely isn't in the table above, drop to `useView(name)` and build it — that's
what the primitive is for. Two rules still hold: colors come from the `--color-chart-*` tokens
(read them with `getComputedStyle`, as `ChartBlock` does), and the figures stay reachable as
text. Anything reusable belongs in `client/app/blocks/`, not copy-pasted across pages.
