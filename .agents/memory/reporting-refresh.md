---
name: Reporting refresh cadence
description: Why the school dashboard's local status polling is not a warehouse refresh schedule
---

Do not treat frontend polling as permission to rerun the Citadel extract. Reporting imports should be deliberate, server-side, and publish a complete validated snapshot only after every read succeeds.

**Why:** The underlying Noon lake can lag by roughly 12 hours, while the original dashboard needs several warehouse reads and consistency checks. Automatically rerunning those reads every time the interface checks status would waste queries and risk confusing stale-source data with fresh data.

**How to apply:** If automatic refresh is requested later, establish the source freshness and query cost first, choose a corresponding cadence, and preserve all-or-nothing validation before replacing what staff see.

Long on-demand imports should save private progress between reads and allow operators to resume, rather than depending on one uninterrupted page or an untracked background process.

**Why:** Completing seven warehouse reads plus validation can outlast a browser connection. An interruption must not discard completed work or expose an incomplete report.

**How to apply:** Separate deliberate import advancement from cheap status polling, and publish the final validated snapshot atomically. Resume reads only under approved operations authorization.
