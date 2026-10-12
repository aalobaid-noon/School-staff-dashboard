import { createSynapseClient, type SynapseClient } from '@noonacademy/synapse-sdk';

const DEFAULT_STAGING_BASE_URL = 'https://citadel.staging.noonedu.io';

const baseUrl = process.env.SYNAPSE_BASE_URL ?? DEFAULT_STAGING_BASE_URL;
const appId = process.env.SYNAPSE_APP_ID;
const appSecret = process.env.SYNAPSE_APP_SECRET;

const missing = [
  ['SYNAPSE_APP_ID', appId],
  ['SYNAPSE_APP_SECRET', appSecret],
]
  .filter(([, value]) => !value)
  .map(([name]) => name);

// Surfaced (not thrown) so the server still boots and the page still renders when
// secrets are absent — that decouples "did the page render?" from "did secrets
// reach the server?", which is exactly the failure first-run setup needs to localise.
export const synapseConfigError =
  missing.length > 0
    ? `Missing required Replit Secret(s): ${missing.join(', ')}. Add them in the Secrets pane (or .env locally), then re-run.`
    : null;

export const synapse: SynapseClient | null =
  appId && appSecret ? createSynapseClient({ baseUrl, appId, appSecret }) : null;

// App identity for the console's Home/Settings tabs. appId is an identifier, not a secret,
// so it's safe to surface. baseUrl is config (which Citadel we point at).
export const synapseAppId: string | null = appId ?? null;
export const synapseBaseUrl: string = baseUrl;

// appSecret is exported ONLY for server-side use (HMAC-signing the Citadel oauth token/refresh
// calls in server/oauth.ts). It is never sent to the client or surfaced by any endpoint.
export const synapseAppSecret: string | null = appSecret ?? null;

// --- End-user "Sign in with Noon" config (deployed app only) ---------------------------------
// Same "surface, don't throw" pattern: the server still boots when these are unset, and the auth
// gate simply stays unmounted (its absence is logged in server/index.ts). APP_OAUTH_REDIRECT_URI
// is config (the deployed callback URL, registered in the Citadel portal); APP_SESSION_SECRET is
// a secret used to HMAC-sign the app's own identity cookie and the OAuth state cookie. The
// Citadel base URL, app id, and app secret above are reused for the oauth redirect + calls — no
// extra identity-provider credential exists anymore.
export const appOauthRedirectUri: string | null = process.env.APP_OAUTH_REDIRECT_URI ?? null;
export const appSessionSecret: string | null = process.env.APP_SESSION_SECRET ?? null;

const authMissing = [
  ['APP_OAUTH_REDIRECT_URI', appOauthRedirectUri],
  ['APP_SESSION_SECRET', appSessionSecret],
  ['SYNAPSE_APP_ID', appId],
  ['SYNAPSE_APP_SECRET', appSecret],
]
  .filter(([, value]) => !value)
  .map(([name]) => name);

export const authConfigError =
  authMissing.length > 0
    ? `Sign in with Noon disabled — missing: ${authMissing.join(', ')}. Set them to enable the login gate.`
    : null;
