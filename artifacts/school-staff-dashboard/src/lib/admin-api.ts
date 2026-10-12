import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type AdminUser = {
  profileId: number; email: string | null; lastUserType: string | null;
  isAdmin: boolean; adminSource: "seed" | "override";
  firstSeenAt: string | null; lastSeenAt: string | null; loginCount: number;
};
export type AdminOverview = {
  viewer: { profileId: number; email: string };
  health: {
    snapshotAvailable: boolean; syncedAt: string | null; windowStart: string | null; windowEnd: string | null;
    ageHours: number | null; staleAfterHours: number;
    status: "fresh" | "stale" | "last_sync_failed" | "no_data";
    runs: { id: string; state: string; completedSteps: number; windowEnd: string; error: string | null; startedAt: string; updatedAt: string }[];
  };
  usage: {
    logins7d: number; users7d: number; logins30d: number; users30d: number;
    daily: { day: string; logins: number; users: number }[];
    byRole: { userType: string; logins: number; users: number }[];
    recent: { profileId: number; email: string | null; userType: string | null; at: string }[];
  };
  users: AdminUser[];
};

export class AdminApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

const KEY = ["dashboard-admin-overview"] as const;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch("/api/dashboard/admin" + path, { credentials: "include", ...init });
  const body = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new AdminApiError(response.status, body.error ?? "Request failed");
  return body as T;
}

export function useAdminOverview() {
  return useQuery({
    queryKey: KEY, queryFn: () => request<AdminOverview>("/overview"),
    retry: false, staleTime: 15_000, refetchInterval: 60_000,
  });
}

export function useSetAdminAccess() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ profileId, isAdmin }: { profileId: number; isAdmin: boolean }) =>
      request<{ profileId: number; isAdmin: boolean }>("/users/" + profileId, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Dashboard-Admin": "1" },
        body: JSON.stringify({ isAdmin }),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: KEY }),
  });
}
