import { bigint, index, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

// Comments staff leave on dashboard cards. The card is stored as the HTML the commenter saw
// (sanitised on the server) so admins review exactly that card, even after the data moves on.
export const cardFeedback = pgTable("card_feedback", {
  id: serial("id").primaryKey(),
  // Verified from the session, never from the request body.
  profileId: bigint("profile_id", { mode: "number" }).notNull(),
  email: text("email").notNull(),
  authorName: text("author_name"),
  userType: text("user_type"),
  // sha256 of kind + normalised card text; groups comments about the same card.
  cardKey: text("card_key").notNull(),
  cardKind: text("card_kind").notNull(),
  cardText: text("card_text").notNull(),
  cardHtml: text("card_html").notNull(),
  // Where the commenter was looking: tab, manager filter, date range, language, data window.
  context: jsonb("context").notNull().default({}),
  comment: text("comment").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("card_feedback_created").on(table.createdAt),
  index("card_feedback_key").on(table.cardKey),
]);
