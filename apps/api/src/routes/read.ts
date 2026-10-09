import { Hono } from "hono";
import { dayRange, findOverlaps, isValidDate, localDateOf, summarize, KZ_OFFSET } from "@shift/core";
import type { Env } from "../env";
import { renderTrip } from "../render";
import type { TripRepository } from "../repo";

const HALF_DAY_MS = 12 * 3_600_000;

export function readRoutes({ repo }: { repo: TripRepository }) {
  const trips = new Hono<Env>();

  trips.get("/", async (c) => {
    const date = c.req.query("date") ?? "";
    if (!isValidDate(date)) return c.json({ errors: [{ field: "date", code: "DATE_INVALID" }] }, 422);

    const { from, to } = dayRange(date);
    // Trips last at most 12h, so overlapping neighbours start within 12h either side of the day.
    const around = await repo.listRange(c.var.sandboxId, from - HALF_DAY_MS, to + HALF_DAY_MS);
    const today = around.filter((t) => t.startUtc >= from && t.startUtc < to);
    const out = today.map((t) => {
      const overlaps = findOverlaps(t, around);
      return {
        ...renderTrip(t),
        durationMinutes: Math.round((t.endUtc - t.startUtc) / 60_000),
        ...(overlaps.length > 0 && { warnings: overlaps.map((id) => ({ code: "OVERLAP", with: id })) }),
      };
    });
    return c.json({ date, timezone: KZ_OFFSET, summary: summarize(today), trips: out });
  });

  const days = new Hono<Env>();
  days.get("/", async (c) => {
    const counts = new Map<string, number>();
    for (const t of await repo.listAll(c.var.sandboxId)) {
      const d = localDateOf(t.startUtc);
      counts.set(d, (counts.get(d) ?? 0) + 1);
    }
    const list = [...counts].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, tripCount]) => ({ date, tripCount }));
    return c.json({ days: list });
  });

  return { trips, days };
}
