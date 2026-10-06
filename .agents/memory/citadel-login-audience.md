---
name: Citadel login audience
description: A live portal requirement missing from the imported Citadel OAuth instructions
---

Citadel applications allowing multiple login audiences require an explicit audience in the profiles API request. Merely putting userType=ADMIN on the authorization URL is insufficient with the currently observed Citadel portal.

**Why:** After the user registered the development callback, the live portal rejected the documented authorization request with “This app allows more than one login audience. Send userType with a type from the app allowlist.” Adding userType=ADMIN did not solve it. A browser diagnosis confirmed that the live authorize SPA ignores this query field and sends only appId and redirectUri to POST /api/oauth/profiles. ADMIN is a recognized enum; renaming the field to user_type is not supported by the observed contract.

**How to apply:** The complete fix belongs in Citadel: parse the query field and forward userType to the profiles API. A single-audience app configuration is a possible operator workaround, but restricting the app to ADMIN also excludes SCHOOL_MANAGER accounts and requires explicit user agreement. Preserve server-side school permissions and never expose report data to bypass the blocked portal.
