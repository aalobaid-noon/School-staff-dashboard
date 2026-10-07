---
name: Completion branch drift
description: A task-completion check can observe a different local branch state from the one just published
---

Do not assume the local working branch still points to the validated GitHub commit after a task-completion check. Inspect HEAD, the merge graph, and the remote branch again before responding to review feedback.

**Why:** A completion check inspected a different local history from the freshly validated and published commit. Its security finding was real in that older local history, even though the published commit had already fixed it.

**How to apply:** Reconcile any newly surfaced local work by a normal merge with the verified published branch, resolve conflicts with the validated security policy, rerun relevant checks, and fast-forward the collaboration branch. Never force-push or assume a previous successful test covers the branch currently checked out.
