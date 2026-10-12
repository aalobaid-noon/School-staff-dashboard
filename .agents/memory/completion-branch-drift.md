---
name: Completion branch drift
description: A task-completion check can observe a different local branch state from the one just published
---

Do not assume the local working branch still points to the validated GitHub commit after a task-completion check. Inspect HEAD, the merge graph, and the remote branch again before responding to review feedback.

**Why:** A completion check inspected a different local history from the freshly validated and published commit. Its security finding was real in that older local history, even though the published commit had already fixed it.

**How to apply:** Reconcile any newly surfaced local work by a normal merge with the verified published branch, resolve conflicts with the validated security policy, rerun relevant checks, and fast-forward the collaboration branch. Never force-push or assume a previous successful test covers the branch currently checked out.

An upstream rollback does not necessarily undo equivalent changes independently reintroduced on the local branch.

**Why:** A clean three-way merge retained locally reintroduced school-data filtering even though the incoming history included a rollback: the upstream changes had canceled out relative to the shared base. Commit ancestry alone did not describe the resulting authorization behavior.

**How to apply:** Inspect the merged authorization code rather than claiming a rollback was applied merely because its commit was merged. Clearly distinguish merging histories from replacing the local tree with the upstream snapshot; do not reset away local privacy protections without informed approval.
