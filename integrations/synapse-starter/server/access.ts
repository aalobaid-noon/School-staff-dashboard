// Who may see what, once the app is deployed.
//
// The sign-in gate (server/auth-routes.ts) answers "is this a Noon staff member?". This file
// answers the next question — "which of them may see THIS?" — and it is the only place that
// answer lives. Both are server-side. Hiding a nav link is a courtesy to the reader, never a
// control: anyone can type the URL, and `/api/views/:name` is a plain HTTP endpoint.
//
// Fresh clones enforce nothing (ROLES and VIEW_ACCESS are empty), which means every signed-in
// staff member sees every view — the template's behaviour before this file existed. Restricting
// something is an explicit act, and an explicit act is reviewable in a diff.
//
// Recipes, and the questions to ask a builder before writing any of this: the
// synapse-access-control skill.

export interface RoleRule {
  /** Name used in VIEW_ACCESS. Lowercase, no spaces: 'ops', 'campus-manager'. */
  role: string;
  /** Exact addresses, compared case-insensitively. */
  emails?: string[];
  /** Whole email domains, without the '@': 'noonacademy.com'. */
  domains?: string[];
}

// WHO. Edit this to declare the app's roles. A person may hold several.
//
//   export const ROLES: RoleRule[] = [
//     { role: 'ops', emails: ['lina@noonacademy.com', 'omar@noonacademy.com'] },
//     { role: 'everyone', domains: ['noonacademy.com', 'noon.edu.sa', 'non.sa'] },
//   ];
export const ROLES: RoleRule[] = [];

// WHAT. Baked-read name → the roles allowed to load it. A read that is ABSENT from this map is
// readable by every signed-in user; that default keeps the common case (an internal dashboard
// everyone in the team may see) free of ceremony.
//
//   export const VIEW_ACCESS: Record<string, string[]> = {
//     'salary-by-campus': ['ops'],
//   };
export const VIEW_ACCESS: Record<string, string[]> = Object.create(null);

// Roles held by an email. Unknown or absent email holds none.
export function rolesFor(email: string | null | undefined): string[] {
  if (!email) return [];
  const lower = email.toLowerCase();
  const at = lower.lastIndexOf('@');
  const domain = at === -1 ? '' : lower.slice(at + 1);

  const held = new Set<string>();
  for (const rule of ROLES) {
    const byEmail = rule.emails?.some((e) => e.toLowerCase() === lower) ?? false;
    // Compare the whole domain, never a suffix: endsWith('noon.edu.sa') would also match
    // 'evilnoon.edu.sa'. This is the mistake that turns a domain allowlist into no allowlist.
    const byDomain = rule.domains?.some((d) => d.toLowerCase() === domain) ?? false;
    if (byEmail || byDomain) held.add(rule.role);
  }
  return [...held];
}

export interface AccessDecision {
  allowed: boolean;
  /** Roles that would have granted it — for the log line, never for the HTTP response. */
  requiredRoles: string[];
}

// May this viewer load this view?
//
// `enforce` is passed explicitly by the caller from REPLIT_DEPLOYMENT rather than inferred from
// "is there a session?". The difference matters: inferring would mean any request that arrives
// without a session is treated as trusted, which is precisely the bug this file exists to avoid.
// In a deployment the sign-in gate runs BEFORE the view routes, so an unauthenticated request
// never reaches here; in the workspace there is no session at all and the builder is alone with
// their own app.
export function canAccessView(
  name: string,
  viewerEmail: string | null | undefined,
  enforce: boolean,
): AccessDecision {
  const requiredRoles = VIEW_ACCESS[name] ?? [];
  if (requiredRoles.length === 0) return { allowed: true, requiredRoles };
  if (!enforce) return { allowed: true, requiredRoles };

  const held = rolesFor(viewerEmail);
  return { allowed: requiredRoles.some((r) => held.includes(r)), requiredRoles };
}

// Views this viewer may load — what the client uses to decide which nav links and blocks to draw.
// A convenience for the UI only; every actual load is checked again server-side.
export function visibleViewNames(
  allNames: string[],
  viewerEmail: string | null | undefined,
  enforce: boolean,
): string[] {
  return allNames.filter((name) => canAccessView(name, viewerEmail, enforce).allowed);
}
