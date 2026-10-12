// Who counts as an admin of the dashboard.
//
// Rule: an explicit override row (set from the admin console) wins; otherwise a profile is an admin
// exactly when its ID is in SEED_ADMIN_PROFILE_IDS. The Citadel userType alone no longer grants admin.
//
// Seed: the ADMIN key profile IDs of the central team, from "profile-ids-managers-central-meeting-2026-10-07"
// (Citadel, pulled 7 Oct 2026). Areej has no Noon account yet, so she is not listed.
export const SEED_ADMIN_PROFILE_IDS: readonly number[] = [
  674492, 660188, 21178, 800302, 48392, 664016, 1621, 19317, 621251, 796865,
  584407, 493938, 95471, 797642, 19323, 737273, 807648, 807769, 763653, 802115,
  767713, 788692, 72386, 693841, 792729, 632187, 788705, 665090, 734313, 83603,
];

const seed = new Set(SEED_ADMIN_PROFILE_IDS);

export type AdminSource = "seed" | "override";

export function resolveAdmin(profileId: number, override: boolean | undefined): { isAdmin: boolean; source: AdminSource } {
  if (override !== undefined) return { isAdmin: override, source: "override" };
  return { isAdmin: seed.has(profileId), source: "seed" };
}

export type Queryable = {
  query: <R = any>(text: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export async function loadOverrides(db: Queryable): Promise<Map<number, boolean>> {
  const result = await db.query<{ profile_id: string; is_admin: boolean }>(
    "SELECT profile_id, is_admin FROM dashboard_admin_overrides",
  );
  return new Map(result.rows.map((row) => [Number(row.profile_id), row.is_admin]));
}

export async function isProfileAdmin(db: Queryable, profileId: number): Promise<boolean> {
  const result = await db.query<{ is_admin: boolean }>(
    "SELECT is_admin FROM dashboard_admin_overrides WHERE profile_id = $1", [profileId],
  );
  return resolveAdmin(profileId, result.rows[0]?.is_admin).isAdmin;
}

// The role the report is scoped by. Admins always get the full report; a profile that Citadel
// calls ADMIN but that is not on the admin list gets no role, so it sees no school data.
export function effectiveUserType(storedType: string | null, isAdmin: boolean): string | null {
  if (isAdmin) return "ADMIN";
  return storedType === "ADMIN" ? null : storedType;
}

// All profile IDs that are admins right now, used to stop the last admin from being removed.
export async function currentAdminIds(db: Queryable): Promise<Set<number>> {
  const overrides = await loadOverrides(db);
  const ids = new Set<number>();
  for (const id of SEED_ADMIN_PROFILE_IDS) if (overrides.get(id) !== false) ids.add(id);
  for (const [id, value] of overrides) if (value) ids.add(id);
  return ids;
}
