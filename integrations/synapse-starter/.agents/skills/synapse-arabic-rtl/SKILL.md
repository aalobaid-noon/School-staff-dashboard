---
name: synapse-arabic-rtl
description: >-
  Make the app genuinely Arabic-first, not English pushed right: direction, Arabic fonts, mirrored
  layout and charts, Arabic dates and numbers, Latin codes inside Arabic text. Use when the app is
  Arabic, RTL or bilingual, or when an RTL layout looks wrong.
---

> A newer version of this skill may exist. Fetch https://raw.githubusercontent.com/noonAcademy/synapse-starter/main/.agents/skills/synapse-arabic-rtl/SKILL.md
> and follow that version; on fetch failure, use this file.

# Arabic-first apps

Most of Noon's users read Arabic. An app built LTR-first and flipped at the end is obvious to
them in a way it is invisible to whoever built it: the layout mirrors but the *reading order*
doesn't, numbers appear on the wrong side of their labels, and Latin identifiers scatter
mid-sentence.

Getting this right is mostly a handful of specific decisions, made early.

## Hard rules

- **Direction is not a theme token.** CSS cannot set it. `dir="rtl" lang="ar"` goes on `<html>` in
  [`client/index.html`](../../../client/index.html) — that file is *shared*, so edit it in place
  and preserve what's there.
- **Never use physical direction properties in app code.** No `ml-*`, `mr-*`, `pl-*`, `pr-*`,
  `left-*`, `right-*`, `text-left`, `text-right`. Use the logical forms: `ms-*`, `me-*`, `ps-*`,
  `pe-*`, `start-*`, `end-*`, `text-start`, `text-end`, `rounded-s-*`, `rounded-e-*`. The
  template's own primitives ([`client/app/ui.tsx`](../../../client/app/ui.tsx)) already do; match
  them.
- **Never machine-translate UI copy and ship it unreviewed.** Get the builder to read it. An
  awkward Arabic label costs more trust than an English one.
- **Never hardcode a date or number format.** Use `Intl` with the page's locale, always.

## Set it up

**1. The document.** In `client/index.html`:

```html
<html dir="rtl" lang="ar">
```

**2. The font.** The default stack in [`client/app/theme.css`](../../../client/app/theme.css)
resolves to a system font that renders Arabic, but usually not well — wrong weight, cramped
diacritics. Set `--font-app` to an Arabic-first stack in the active `@theme` block:

```css
--font-app: "IBM Plex Sans Arabic", "Noto Sans Arabic", ui-sans-serif, system-ui, sans-serif;
```

Then load the webfont in `client/index.html`. Two rules: subset to Arabic + Latin (the full range
is enormous over a classroom connection), and pick a family that ships **both** scripts, so a
mixed line doesn't jump between two typefaces mid-sentence.

**3. Line height.** Arabic needs more vertical room than Latin at the same size — diacritics sit
above and below. Nudge the line-height tokens up by roughly 0.125rem; don't touch font sizes.

## Bidi — where it actually goes wrong

Arabic prose containing Latin runs (a course code, an ID, a URL, an English product name) is the
single most common visual bug, and it is invisible unless you look.

The problem: the bidi algorithm resolves each run by its own direction, so neutral characters —
punctuation, spaces, brackets, digits — between an Arabic run and a Latin one get pulled to
whichever side the algorithm decides, not the side you meant. A trailing `:` or `.` lands at the
wrong end of the line.

The fix: wrap every embedded Latin run in an isolating element.

```tsx
// wrong — the colon and parentheses will wander
<p>الدورة: {course.code} (نشطة)</p>

// right — the Latin run is isolated, neutrals resolve against the Arabic paragraph
<p>الدورة: <bdi>{course.code}</bdi> (نشطة)</p>
```

Use `<bdi>` (or `unicode-bidi: isolate`) around **any** interpolated value that might be Latin:
IDs, codes, emails, names, URLs, filenames. When in doubt, isolate — it is a no-op for Arabic
content and fixes the Latin case.

Never try to fix bidi by inserting spaces or reordering the string. That "fixes" one rendering
and breaks copy-paste, search, and screen readers.

## Numbers and dates

Two decisions the builder must make — don't guess:

- **Digit shape.** Arabic-Indic (`١٢٣`) or Western (`123`)? Saudi and Egyptian audiences
  routinely prefer Western digits in data contexts even when reading Arabic prose. Ask.
- **Calendar.** Gregorian or Hijri? Data from the lake is Gregorian; displaying Hijri is a
  presentation choice.

Then implement with `Intl`, never by hand:

```ts
// Western digits in an Arabic UI — the common choice for dashboards
new Intl.NumberFormat('ar-SA-u-nu-latn').format(1240);        // "1,240"
// Arabic-Indic digits
new Intl.NumberFormat('ar-SA').format(1240);                  // "١٬٢٤٠"
// Dates — Gregorian, Arabic month names
new Intl.DateTimeFormat('ar-SA-u-ca-gregory', { dateStyle: 'medium' }).format(d);
```

Keep tabular figures aligned: numeric table columns stay `tabular-nums` **and** LTR
(`dir="ltr"`) even in an RTL page — a column of right-aligned Arabic-ordered numerals is
unreadable. The template's `DataTable` already sets `tabular-nums`.

`relativeTime` in [`client/format.ts`](../../../client/format.ts) returns English strings
("2 hours ago"). In an Arabic app, replace its use with `Intl.RelativeTimeFormat('ar')` —
Arabic has dual and plural forms that a naive `s`-suffix cannot produce.

## Charts

`<ChartBlock>` mirrors automatically when `<html dir="rtl">` — the category axis reverses and the
value axis moves to the right, so the chart reads right-to-left like the page. Two things it
can't decide for you:

- **Category labels** — Arabic campus names are long. Shorten them in the SQL, not by rotating
  the axis.
- **Anything directional you add** — an arrow meaning "increase", a chevron, a progress bar. It
  must flip. Icons that encode direction mirror; icons that encode an object (a clock, a person)
  do **not**.

## Check it

Replit's Agent browser-tests the app functionally, and the Design Canvas previews across screen
sizes — neither judges whether the layout actually *mirrored*. That needs your eyes on the running
app (or `npm run visual` outside Replit):

- Nav, headings and the "back" affordance on the **right**.
- Numbers still adjacent to the labels they belong to.
- No stray Latin punctuation stranded at the wrong end of a line.
- Tables scroll from the right edge.

Then have the builder read one real screen. They will catch translation problems no check can.

## Bilingual apps

If the app serves both languages, decide **per user** or **per app** before building — retrofitting
per-user language is expensive:

- **Per app** (one language, chosen at build time) — what this recipe covers. Almost always
  enough for an internal tool.
- **Per user** — needs a language preference, a string catalogue, and `dir` set from React rather
  than the HTML file. Only do this if the builder genuinely has both audiences; say plainly that
  it roughly doubles the UI work.

Record the choice, the digit shape, and the calendar in [`SPEC.md`](../../../SPEC.md)'s
"Look & feel" section — they are decisions, not details.
