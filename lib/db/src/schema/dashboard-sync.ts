import { sql } from "drizzle-orm";
import { pgTable, uuid, text, integer, jsonb, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// Temporary extracts remain private in PostgreSQL, never in the web build.
export const dashboardSyncRuns = pgTable("dashboard_sync_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  state: text("state").notNull().default("running"),
  nextStep: integer("next_step").notNull().default(0),
  windowEnd: text("window_end").notNull(),
  raw: jsonb("raw").notNull().default({}),
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("dashboard_sync_one_running").on(table.state).where(sql`${table.state} = 'running'`),
]);
