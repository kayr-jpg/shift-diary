import { describe, expect, it } from "vitest";
import type { StoredTrip } from "../src/repo";
import { makeTestRepo, NOW } from "./helpers";

const H = 3_600_000;
const T0 = Date.UTC(2026, 9, 1, 3, 0);
const st = (id: string, startUtc: number, over: Partial<StoredTrip> = {}): StoredTrip => ({
  id,
  startUtc,
  endUtc: startUtc + H / 2,
  startOffset: "+05:00",
  endOffset: "+05:00",
  amount: 1000,
  commission: 100,
  payment: "cash",
  ...over,
});

describe("sqlite TripRepository", () => {
  it("creates a seeded sandbox; listAll is sorted by start", async () => {
    const repo = makeTestRepo();
    await repo.createSandbox("a", [st("late", T0 + 2 * H), st("early", T0)], NOW);
    expect(await repo.sandboxExists("a")).toBe(true);
    expect(await repo.sandboxExists("b")).toBe(false);
    expect((await repo.listAll("a")).map((t) => t.id)).toEqual(["early", "late"]);
  });

  it("insertIfAbsent: created once, then returns the first stored row unchanged", async () => {
    const repo = makeTestRepo();
    await repo.createSandbox("a", [], NOW);
    const first = await repo.insertIfAbsent("a", st("x", T0), NOW);
    expect(first).toEqual({ created: true, stored: st("x", T0) });
    const second = await repo.insertIfAbsent("a", st("x", T0, { amount: 5, endOffset: "Z" }), NOW);
    expect(second).toEqual({ created: false, stored: st("x", T0) });
    expect(await repo.listAll("a")).toHaveLength(1);
  });

  it("listRange is half-open [from, to) on start", async () => {
    const repo = makeTestRepo();
    await repo.createSandbox("a", [st("a", T0), st("b", T0 + H), st("c", T0 + 2 * H)], NOW);
    expect((await repo.listRange("a", T0, T0 + 2 * H)).map((t) => t.id)).toEqual(["a", "b"]);
    expect((await repo.listRange("a", T0 + 1, T0 + 2 * H + 1)).map((t) => t.id)).toEqual([
      "b",
      "c",
    ]);
  });

  it("resetSandbox restores the seed for that sandbox only", async () => {
    const repo = makeTestRepo();
    await repo.createSandbox("a", [st("s", T0)], NOW);
    await repo.createSandbox("b", [st("s", T0)], NOW);
    await repo.insertIfAbsent("a", st("extra", T0 + H), NOW);
    await repo.insertIfAbsent("b", st("extra", T0 + H), NOW);
    await repo.resetSandbox("a", [st("s", T0)], NOW + 1);
    expect((await repo.listAll("a")).map((t) => t.id)).toEqual(["s"]);
    expect((await repo.listAll("b")).map((t) => t.id)).toEqual(["s", "extra"]);
  });

  it("deleteStale removes sandboxes last seen before the cutoff, with their trips", async () => {
    const repo = makeTestRepo();
    await repo.createSandbox("old", [st("s", T0)], NOW - 10);
    await repo.createSandbox("touched", [st("s", T0)], NOW - 10);
    await repo.createSandbox("fresh", [], NOW);
    await repo.touchSandbox("touched", NOW);
    expect(await repo.deleteStale(NOW - 5)).toBe(1);
    expect(await repo.sandboxExists("old")).toBe(false);
    expect(await repo.listAll("old")).toHaveLength(0);
    expect(await repo.sandboxExists("touched")).toBe(true);
    expect(await repo.listAll("touched")).toHaveLength(1);
    expect(await repo.sandboxExists("fresh")).toBe(true);
  });
});
