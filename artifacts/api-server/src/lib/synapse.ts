import { buildHeaders } from "@noonacademy/citadel-transport";
import { createSynapseClient, type SynapseClient } from "@noonacademy/synapse-sdk";

// Credentials are resolved only on the server and never included in responses or logs.
const appId = process.env.SYNAPSE_APP_ID;
const appSecret = process.env.SYNAPSE_APP_SECRET;
const baseUrl = process.env.SYNAPSE_BASE_URL;

function configurationError(): string | null {
  if (!appId || !appSecret || !baseUrl) {
    return "Set SYNAPSE_APP_ID, SYNAPSE_APP_SECRET and SYNAPSE_BASE_URL in Secrets.";
  }
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
      return "SYNAPSE_BASE_URL must be an HTTPS Citadel URL without credentials or query parameters.";
    }
  } catch {
    return "SYNAPSE_BASE_URL is not a valid HTTPS URL.";
  }
  return null;
}

export const synapseConfigError = configurationError();
export const synapse: SynapseClient | null = synapseConfigError
  ? null
  : createSynapseClient({ appId: appId!, appSecret: appSecret!, baseUrl: baseUrl! });

export async function getCitadelMetadata(path: "/api/whoami" | "/api/registry/meta"): Promise<Response> {
  if (!synapse || !appId || !appSecret || !baseUrl) {
    throw new Error("Synapse is not configured.");
  }
  return fetch(new URL(path, baseUrl), {
    headers: buildHeaders({ appId, appSecret, baseUrl }, path, ""),
    signal: AbortSignal.timeout(8_000),
  });
}

type ConnectionStatus = {
  configured: boolean;
  connected: boolean;
  message: string;
  authStatus: "callback_registration_required";
};

let cached: { status: ConnectionStatus; expiresAt: number } | undefined;
let pending: Promise<ConnectionStatus> | undefined;

export async function getSynapseStatus(): Promise<ConnectionStatus> {
  if (!synapse) {
    return {
      configured: false,
      connected: false,
      message: synapseConfigError!,
      authStatus: "callback_registration_required",
    };
  }
  if (cached && cached.expiresAt > Date.now()) return cached.status;
  if (pending) return pending;
  pending = (async () => {
    let connected = false;
    let message = "Citadel is unavailable. Check the connection and credentials.";
    try {
      const response = await getCitadelMetadata("/api/whoami");
      connected = response.ok;
      message = connected
        ? "Synapse is connected. School data remains private while Noon sign-in is being configured."
        : `Citadel connection check returned HTTP ${response.status}.`;
      // Do not project the upstream identity or credential-related response into the public API.
      await response.body?.cancel();
    } catch {
      // Deliberately omit network errors: they can contain a configured URL.
    }
    const status: ConnectionStatus = {
      configured: true,
      connected,
      message,
      authStatus: "callback_registration_required",
    };
    cached = { status, expiresAt: Date.now() + 30_000 };
    return status;
  })().finally(() => { pending = undefined; });
  return pending;
}
