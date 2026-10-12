import { bigint, boolean, index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

// Every verified staff sign-in, one row per profile. Never stores tokens or cookies.
export const dashboardUsers = pgTable("dashboard_users", {
  profileId: bigint("profile_id", { mode: "number" }).primaryKey(),
  email: text("email").notNull(),
  lastUserType: text("last_user_type"),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  loginCount: integer("login_count").notNull().default(1),
});

// One row per verified sign-in; the admin console reads usage from here.
export const dashboardLoginEvents = pgTable("dashboard_login_events", {
  id: serial("id").primaryKey(),
  profileId: bigint("profile_id", { mode: "number" }).notNull(),
  userType: text("user_type"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("dashboard_login_events_at").on(table.occurredAt)]);

// Admin decisions that override the built-in admin list in lib/admin-access.ts.
// A row says "this profile is (true) or is not (false) an admin", whatever the seed list says.
export const dashboardAdminOverrides = pgTable("dashboard_admin_overrides", {
  profileId: bigint("profile_id", { mode: "number" }).primaryKey(),
  isAdmin: boolean("is_admin").notNull(),
  updatedBy: bigint("updated_by", { mode: "number" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
