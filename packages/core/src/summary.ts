export type Summary = {
  tripCount: number;
  revenue: number;
  commission: number;
  net: number;
  cash: number;
  card: number;
};

const ZERO: Summary = { tripCount: 0, revenue: 0, commission: 0, net: 0, cash: 0, card: 0 };

/** Integer sums over trips; amounts are whole currency units so no rounding occurs. */
export function summarize(
  trips: ReadonlyArray<{ amount: number; commission: number; payment: "cash" | "card" }>,
): Summary {
  return trips.reduce<Summary>(
    (s, t) => ({
      tripCount: s.tripCount + 1,
      revenue: s.revenue + t.amount,
      commission: s.commission + t.commission,
      net: s.net + (t.amount - t.commission),
      cash: s.cash + (t.payment === "cash" ? t.amount : 0),
      card: s.card + (t.payment === "card" ? t.amount : 0),
    }),
    ZERO,
  );
}
