import { bigint, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const dashboardSessions = pgTable("dashboard_sessions", {
  sessionHash: text("session_hash").primaryKey(),
  email: text("email").notNull(),
  profileId: bigint("profile_id", { mode: "number" }).notNull(),
  userType: text("user_type"),
  refreshToken: text("refresh_token").notNull(),
  accessExpiresAt: timestamp("access_expires_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
