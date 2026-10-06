---
name: Citadel login audience
description: A live portal requirement missing from the imported Citadel OAuth instructions
---

Citadel applications allowing multiple login audiences require an explicit audience on their authorization request. This staff dashboard uses ADMIN, the staff profile type in the imported OAuth examples.

**Why:** After the user registered the development callback, the live portal rejected the documented authorization request with “This app allows more than one login audience. Send userType with a type from the app allowlist.” The imported migration instructions omit this field.

**How to apply:** Preserve an explicit staff audience when revising sign-in. If the app allowlist changes, confirm its accepted types rather than relying on the old instructions or allowing the browser to choose unrestricted audiences. Audience selection does not replace server-side school permissions.
