import { parseIsoInstant, type Trip } from "./trip";

export type CanonicalTrip = {
  id: string;
  startUtc: number;
  endUtc: number;
  amount: number;
  commission: number;
  payment: "cash" | "card";
};

/** Assumes an already-valid Trip. */
export function canonicalize(trip: Trip): CanonicalTrip {
  const startUtc = parseIsoInstant(trip.start);
  const endUtc = parseIsoInstant(trip.end);
  if (startUtc === null || endUtc === null) throw new RangeError("canonicalize: invalid trip time");
  return {
    id: trip.id,
    startUtc,
    endUtc,
    amount: trip.amount,
    commission: trip.commission,
    payment: trip.payment,
  };
}

/** Field-level differences keyed by Trip field name; `id` is never diffed. */
export function diffCanonical(
  stored: CanonicalTrip,
  sent: CanonicalTrip,
): Record<string, [unknown, unknown]> {
  const pairs: [string, unknown, unknown][] = [
    ["start", stored.startUtc, sent.startUtc],
    ["end", stored.endUtc, sent.endUtc],
    ["amount", stored.amount, sent.amount],
    ["commission", stored.commission, sent.commission],
    ["payment", stored.payment, sent.payment],
  ];
  const out: Record<string, [unknown, unknown]> = {};
  for (const [key, a, b] of pairs) if (a !== b) out[key] = [a, b];
  return out;
}

/** Ids of others whose interval strictly overlaps the candidate's. */
export function findOverlaps(candidate: CanonicalTrip, others: CanonicalTrip[]): string[] {
  return others
    .filter(
      (o) => o.id !== candidate.id && candidate.startUtc < o.endUtc && o.startUtc < candidate.endUtc,
    )
    .map((o) => o.id);
}
