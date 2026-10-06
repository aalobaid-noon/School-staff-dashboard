---
name: Citadel login diagnosis
description: Separate observed portal audience behavior from verified operator configuration
---

Treat the operator's Citadel configuration as authoritative and compare the app's actual request against it before recommending configuration changes. Multiple allowed staff roles are intentional, not proof of misconfiguration.

**Why:** Earlier diagnosis focused on a multi-audience error and an observed portal bundle that omitted userType from its profiles request. The operator's later screenshot revealed a separate mismatch: the registered callback and the app's requested callback were different. That app-side mismatch had not been checked before asserting the complete fix belonged in Citadel.

**How to apply:** First align and verify registered redirect URLs, proxy routing, and browser cookie delivery. Inspect the current portal's actual requests before treating earlier bundle behavior as current. ADMIN is a recognized staff enum, but audience selection never replaces server-side school permissions. Do not weaken report privacy or require reduced allowed roles solely to work around an incompletely diagnosed error.
