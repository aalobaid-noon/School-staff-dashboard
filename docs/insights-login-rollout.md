# Insights browser login rollout

## Before publishing

The production report uses the Citadel registration `school-staff-success`
in Citadel. Do not change the separate registration named
`school-staff-dashboard`.

The `school-staff-success` registration currently includes Teacher and Cluster
Manager. The report rejects both roles. Set its allowed roles to Admin,
School Manager, School Lead, and Facilitator before publishing this change.
Keep the callback URLs, origins, teams, credentials, and other apps unchanged.

This is a required deployment dependency. Citadel can infer staff login when
its allowlist contains only staff roles. A mixed allowlist that includes Teacher
requires an explicit audience and will reject a fresh login without one.

Merge into `school-staff-dashboard-updates`, pull that branch in Replit, and
publish it. Do not overwrite the separate GitHub `main` history.

## Verify the published build

1. Use a fresh browser session with third-party cookies blocked. Open Insights
   from the School web app. The embedded sign-in page must offer a new-tab link.
2. Follow the link. Select the staff profile in Citadel. Verify that sign-in and
   the report remain in the new tab and that no Replit role selector appears.
3. Check Admin, School Manager, School Lead, and Facilitator profiles. Verify
   the existing campus and personal-data restrictions.
4. Test Safari and Chrome with third-party cookies blocked. Also test an
   existing report session and the Switch profile link.
5. Retry the reported profiles. Use their attempt reference to correlate
   login and callback events. A callback rejected before token exchange cannot
   safely identify the profile; do not infer identity from a browser parameter.

## Diagnostics

Search the application logs for `event=dashboard_oauth` and `correlationId`.
The same ID appears in the `X-Dashboard-Auth-Id` response header and on a failed
callback page. The ID is an HMAC-derived reference, not the OAuth state or a
credential. A malformed state or missing configuration gets a new reference.

Reasons include `login_started`, `embedded_callback`,
`invalid_callback_parameters`, `state_cookie_missing`, `state_mismatch`,
`configuration_missing`, `profile_not_authorized`, `profile_role_missing`,
`unsupported_profile_role`, `token_exchange_failed`, `token_response_failed`,
`session_store_failed`, and `session_created`.

Profile ID and role are logged only after server-to-server profile verification.
Do not log codes, state values, cookies, tokens, email addresses, upstream
response bodies, or raw exceptions. HTTP request logs omit query strings.

These events go to the existing application logger. Replit log ingestion into
Datadog is a separate operational step; this change does not configure it.

## Rollback

Republish the previous Replit revision. The staff-only Citadel allowlist remains
compatible with its explicit role selection. Keep OAuth state validation and
the server-side scope checks enabled.
