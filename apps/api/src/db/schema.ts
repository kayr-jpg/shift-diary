import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const sandboxes = sqliteTable("sandboxes", {
  id: text("id").primaryKey(),
  createdAt: integer("created_at").notNull(),
  lastSeen: integer("last_seen").notNull(),
});

export const trips = sqliteTable(
  "trips",
  {
    sandboxId: text("sandbox_id")
      .notNull()
      .references(() => sandboxes.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    startUtc: integer("start_utc").notNull(),
    endUtc: integer("end_utc").notNull(),
    startOffset: text("start_offset").notNull(),
    endOffset: text("end_offset").notNull(),
    amount: integer("amount").notNull(),
    commission: integer("commission").notNull(),
    payment: text("payment", { enum: ["cash", "card"] }).notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.sandboxId, t.id] }),
    index("trips_by_day").on(t.sandboxId, t.startUtc),
    check("trips_payment_check", sql`${t.payment} IN ('cash','card')`),
  ],
);
