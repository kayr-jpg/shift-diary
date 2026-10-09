import type { Summary, Trip } from "@shift/core";

export type TripWarning = { code: "OVERLAP"; with: string };
export type DayTrip = Trip & { durationMinutes: number; warnings?: TripWarning[] };
export type DayResponse = { date: string; timezone: string; summary: Summary; trips: DayTrip[] };
export type DayCount = { date: string; tripCount: number };

/** The request never reached the server (offline, DNS, CORS, aborted). */
export class NetworkError extends Error {
  constructor(cause?: unknown) {
    super("network error", { cause });
    this.name = "NetworkError";
  }
}

/** The server answered with a non-2xx status. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`HTTP ${status}`);
    this.name = "ApiError";
  }
}

async function send(path: string, init?: RequestInit): Promise<Response> {
  try {
    // Same-origin in production and via the Vite proxy in dev; the `sid` cookie selects the sandbox.
    return await fetch(path, { credentials: "include", ...init });
  } catch (e) {
    throw new NetworkError(e);
  }
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function getJson<T>(path: string): Promise<T> {
  const res = await send(path, { headers: { Accept: "application/json" } });
  const body = await readBody(res);
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

export function getDay(date: string): Promise<DayResponse> {
  return getJson<DayResponse>(`/api/trips?date=${encodeURIComponent(date)}`);
}

export async function getDays(): Promise<DayCount[]> {
  return (await getJson<{ days: DayCount[] }>("/api/days")).days;
}

/** Never throws on an HTTP status; only on a network failure (NetworkError). */
export async function postTrip(trip: Trip): Promise<{ status: number; replay: boolean; body: unknown }> {
  const res = await send("/api/trips", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(trip),
  });
  return {
    status: res.status,
    replay: res.headers.get("Idempotent-Replay") === "true",
    body: await readBody(res),
  };
}

export async function reset(): Promise<void> {
  const res = await send("/api/sandbox/reset", { method: "POST" });
  if (!res.ok) throw new ApiError(res.status, await readBody(res));
}

export type RawExchange = {
  request: { method: string; path: string; headers: Record<string, string>; body: unknown };
  response: { status: number; statusText: string; headers: Record<string, string>; body: unknown };
};

/**
 * Like postTrip/reset but keeps the HTTP details so the "under the hood" panel can show them.
 * Never throws on an HTTP status; a network failure propagates as NetworkError.
 */
export async function rawRequest(method: string, path: string, body?: unknown): Promise<RawExchange> {
  const reqHeaders: Record<string, string> = body === undefined ? {} : { "Content-Type": "application/json" };
  const res = await send(path, {
    method,
    headers: { Accept: "application/json", ...reqHeaders },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const resHeaders: Record<string, string> = {};
  for (const name of ["content-type", "idempotent-replay"]) {
    const v = res.headers.get(name);
    if (v !== null) resHeaders[name] = v;
  }
  return {
    request: { method, path, headers: reqHeaders, body },
    response: { status: res.status, statusText: res.statusText, headers: resHeaders, body: await readBody(res) },
  };
}

const HEADER_CASE: Record<string, string> = { "content-type": "Content-Type", "idempotent-replay": "Idempotent-Replay" };

function formatBody(body: unknown): string[] {
  if (body === undefined || body === null) return [];
  return ["", typeof body === "string" ? body : JSON.stringify(body, null, 2)];
}

function formatHeaders(headers: Record<string, string>): string[] {
  return Object.entries(headers).map(([k, v]) => `${HEADER_CASE[k.toLowerCase()] ?? k}: ${v}`);
}

export function formatRequest(rq: RawExchange["request"]): string {
  return [`${rq.method} ${rq.path}`, ...formatHeaders(rq.headers), ...formatBody(rq.body)].join("\n");
}

export function formatResponse(rs: RawExchange["response"]): string {
  return [`HTTP ${rs.status}`, ...formatHeaders(rs.headers), ...formatBody(rs.body)].join("\n");
}

/** Plain-text rendering of a request/response pair: request, blank line, response. */
export function formatExchange(ex: RawExchange): string {
  return `${formatRequest(ex.request)}\n\n${formatResponse(ex.response)}`;
}

export const api = { getDay, getDays, postTrip, reset };
