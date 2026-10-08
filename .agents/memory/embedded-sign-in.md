---
name: Embedded sign-in context
description: Non-obvious cookie-delivery behavior when Citadel OAuth runs inside a cross-site preview
---

Keep OAuth initiation, callback, and the protected report in the same embedded browsing context, whether testing development or the published app. An external tab and a preview frame do not necessarily share the browser state needed to complete the user's tablet workflow.

**Why:** In a synthetic cross-site preview test, a partitioned OAuth state cookie appeared in browser storage but was not sent on the same-frame callback. A non-partitioned cross-site cookie was delivered on the callback in a repeat of that test. Merely checking Set-Cookie or browser storage would have produced a false-positive diagnosis. This does not establish how every browser or an authorized Google session behaves.

**How to apply:** Test the full handoff as an embedded frame under a different top-level site in whichever environment is affected. Inspect whether the callback request itself includes the state cookie before declaring sign-in fixed. Separately verify the authorized Google return and report session when an account is available; do not replace the state check or disclose private report data to bypass browser restrictions.
