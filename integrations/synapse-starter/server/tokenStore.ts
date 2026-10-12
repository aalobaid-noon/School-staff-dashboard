// Server-side store for the Citadel tokens obtained per signed-in user, keyed by the session id that
// the identity cookie carries. Keeping the tokens here (not in the cookie) means the browser never
// holds a Citadel credential.
//
// POC: in-memory only. A process restart drops every entry, so the tokens are gone even though the
// signed identity cookie survives. That's acceptable for v1 because reads are still app-wide (the
// per-user token isn't consumed by any read yet). Future hardening: a durable store, and treating a
// missing entry as "force re-auth" once per-user reads land.

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  // Lifetime of accessToken in seconds, as reported by Citadel.
  expiresIn: number;
  // Unix milliseconds when the pair was stored — expiry = obtainedAt + expiresIn * 1000.
  obtainedAt: number;
}

export interface TokenStore {
  get(sessionId: string): StoredTokens | undefined;
  set(sessionId: string, tokens: StoredTokens): void;
  delete(sessionId: string): void;
}

export function createTokenStore(): TokenStore {
  const store = new Map<string, StoredTokens>();
  return {
    get: (sessionId) => store.get(sessionId),
    set: (sessionId, tokens) => {
      store.set(sessionId, tokens);
    },
    delete: (sessionId) => {
      store.delete(sessionId);
    },
  };
}

// Process-wide singleton used by the running server. Tests construct their own via createTokenStore.
export const tokenStore: TokenStore = createTokenStore();
