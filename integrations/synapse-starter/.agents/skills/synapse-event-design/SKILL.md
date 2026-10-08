---
name: synapse-event-design
description: >-
  Choose which moments to report to Noon, declare new event types, publish them, and verify
  delivery. Use for "track this", "publish an event", "instrument X", "what should this emit".
---

> A newer version of this skill may exist. Fetch https://raw.githubusercontent.com/noonAcademy/synapse-starter/main/.agents/skills/synapse-event-design/SKILL.md
> and follow that version; on fetch failure, use this file.

# Design events for this app

Events are how this app reports to Noon. They flow through `synapse.publishEvent(type, payload)`
server-side; Citadel correlates them with warehouse entities by the IDs in the payload.

## When to publish (and when not to)

Publish at **domain-meaningful moments** — the things Noon would want in its record of what
happened: `homework_submitted`, `level_completed`, `course_joined`, `report_generated`.

Do **not** instrument raw UI mechanics: `button_clicked`, `page_viewed`, `modal_opened` are
analytics noise, not domain events. If the moment wouldn't mean anything to someone reading the
event stream without seeing the UI, don't emit it.

## Two publish paths

- **Server code** (request handlers, boot, jobs): call `synapse.publishEvent(type, payload)`
  directly (`server/synapse.ts` exports the client; it's `null` when secrets are missing — handle
  that, don't throw).
- **Client code** (a click, a completed level): call `sendEvent(type, payload)` from
  `client/sendEvent.ts` (or the `useSendEvent` hook for button states). It POSTs to `/api/events`;
  the server publishes with the app secret, which never reaches the browser.
  **`sendEvent` publishes, it does not declare** — the type must already exist.

## Choosing or declaring the type

1. **Reuse a catalogued built-in** if one reasonably fits — browse them under "Events your app can
   send" on the **Events** tab, or in `@noonacademy/synapse-catalog`. Built-ins keep payload
   autocomplete.
2. **If none fits, declare it yourself** in the server code you're writing — there is no Noon-side
   step, and you never hand this off to the user:

   ```ts
   const res = await synapse.declareEvent('homework_submitted', {
     description: 'Sent when a student submits a homework assignment.',
     examplePayload: {
       user_id: 12345,
       course_id: 678,
       campus_id: 42,
       submitted_at: '2026-07-14T09:30:00Z',
     },
   });
   ```

   Handle all three results:
   - `created` → it's yours; publish it now.
   - `suggested` → an existing type already covers this; use `res.suggestedType` instead.
   - `blocked` → read `res.reason`, fix the name or description, retry.

   Declared types are runtime strings, so no payload autocomplete — expected.

## Payload design rules

The **example payload you pass to `declareEvent` IS the contract** — Citadel derives the shape
from it. So make it realistic but schematic, and:

- **Flat and minimal** — just the fields that define what happened. No nesting, no whole records.
- **Typed consistently** — numbers as numbers, booleans as booleans; don't stringify everything.
- **Include the entity IDs** (`user_id`, `course_id`, `campus_id`, `staff_id`, …) so Citadel can
  correlate the event with warehouse rows. An event without IDs can't be joined to anything.
- **Timestamps as ISO 8601 strings** (`'2026-07-14T09:30:00Z'`), not epoch numbers or locale text.
- No PII (names, phones, emails) — reference people by ID.

## Naming convention

**snake_case, past tense: `<entity>_<verb_past>`** — `homework_submitted`, `task_reassigned`,
`level_completed`. A lowercase-dotted namespace prefix is fine when the app grows
(`grading.task_reassigned`). Names are lowercase, per-app (you can't redeclare a built-in or a
type this app already declared), and always describe something that *happened*, never a command.

## Verify delivery

Open the console's **Events** tab → "What your app has sent":

- **Delivered** (green) = accepted by Citadel, with a Noon event ID. This is the success signal.
- **Couldn't deliver** = failed permanently; read the error.
- The log shows only *settled* outcomes since boot — an event still queued or in flight doesn't
  appear yet.

`publishEvent` itself resolves to `{ status: 'accepted', eventId }` or `{ status: 'queued' }`
(couldn't reach Citadel; queued for retry with backoff).

## Not durable storage

The retry queue is **in-memory**. A `queued` event is lost if the process restarts before the
retry lands, and the publish log resets on every boot. Events are a reporting stream, not a
database: never treat them as the system of record, and never design a feature that reads its own
events back to reconstruct state.
