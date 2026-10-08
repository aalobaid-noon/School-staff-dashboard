import { jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

// Private reporting snapshots; only server-side code may load the document.
export const schoolReportSnapshots = pgTable("school_report_snapshots", {
  id: serial("id").primaryKey(),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  windowStart: text("window_start").notNull(),
  windowEnd: text("window_end").notNull(),
  document: jsonb("document").notNull(),
});
