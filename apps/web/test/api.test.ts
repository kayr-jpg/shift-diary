import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, NetworkError, getDay, postTrip, reset } from "../src/api";
import { createQueryClient, retryDelay, shouldRetry } from "../src/queryClient";

const trip = {
  id: "t1",
  start: "2026-10-01T08:10:00+05:00",
  end: "2026-10-01T08:32:00+05:00",
  amount: 2400,
  commission: 360,
  payment: "card" as const,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("api client", () => {
  it("postTrip reports replay and sends the cookie", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify(trip), { status: 200, headers: { "Idempotent-Replay": "true" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(await postTrip(trip)).toEqual({ status: 200, replay: true, body: trip });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trips",
      expect.objectContaining({ method: "POST", credentials: "include", body: JSON.stringify(trip) }),
    );
  });

  it("postTrip resolves (does not throw) on 409 and 422", async () => {
    for (const status of [409, 422]) {
      vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ errors: [] }), { status }));
      expect(await postTrip(trip)).toEqual({ status, replay: false, body: { errors: [] } });
    }
  });

  it("throws NetworkError when fetch rejects", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(postTrip(trip)).rejects.toBeInstanceOf(NetworkError);
    await expect(getDay("2026-10-01")).rejects.toBeInstanceOf(NetworkError);
  });

  it("GETs throw ApiError on non-2xx; reset expects 204", async () => {
    vi.stubGlobal("fetch", async () => new Response('{"errors":[{"field":"date","code":"DATE_INVALID"}]}', { status: 422 }));
    await expect(getDay("x")).rejects.toBeInstanceOf(ApiError);
    vi.stubGlobal("fetch", async () => new Response(null, { status: 204 }));
    await expect(reset()).resolves.toBeUndefined();
  });

  it("GET queries retry 3 times with exponential backoff", () => {
    const q = createQueryClient().getDefaultOptions().queries;
    expect(q?.retry).toBe(shouldRetry);
    expect(q?.networkMode).toBe("always");
    expect(q?.refetchOnReconnect).toBe(true);
    expect([0, 1, 2, 3].map((n) => shouldRetry(n, new Error("x")))).toEqual([true, true, true, false]);
    expect([0, 1, 2, 5].map(retryDelay)).toEqual([1000, 2000, 4000, 10_000]);
  });

  it("does not retry a network failure while the browser is offline", () => {
    const err = new NetworkError(new TypeError("Failed to fetch"));
    expect(shouldRetry(0, err)).toBe(true);
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    expect(shouldRetry(0, err)).toBe(false);
    expect(shouldRetry(0, new Error("500"))).toBe(true);
  });
});
