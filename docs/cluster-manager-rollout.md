# Cluster Manager access

Cluster Managers can open Insights only for campus IDs linked to their verified profile in `campus_managers`. The report import stores active Cluster Manager links in the private snapshot. Old snapshots without these links grant no access. Membership changes take effect after the warehouse and report refresh.

The response excludes the membership map, manager-wide weekly totals, unrelated campuses, and global comparisons. Cluster Managers cannot refresh the report or use admin controls. The existing `school_insights_embed` flag controls the School Staff tab.

## Rollout

1. Merge and publish this branch from Replit.
2. Complete a report import so the snapshot contains `clusterManagers`.
3. Add Cluster Manager to the allowed roles of `school-staff-success` in Citadel. Keep the other staff roles selected.
4. Confirm the user's feature flag and ask them to sign in with their Cluster Manager profile.

Keep the report's existing campus coverage rules. An assigned campus without report data will not appear. Do not grant Admin to work around missing coverage.

To stop Cluster Manager sign-in, remove only Cluster Manager from this app's Citadel roles and roll back the Replit change to invalidate existing Cluster Manager sessions.
