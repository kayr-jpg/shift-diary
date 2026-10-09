import { onlineManager, QueryCache, QueryClient } from "@tanstack/react-query";
import { NetworkError } from "./api";
import { pushToast } from "./toasts";

/** 1s, 2s, 4s … capped at 10s. */
export const retryDelay = (attempt: number) => Math.min(1000 * 2 ** attempt, 10_000);

const MAX_RETRIES = 3;

/**
 * Retry transient failures, but not a network failure while the browser says it is offline:
 * that would only keep the skeleton up for seconds. Reconnecting refetches anyway.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof NetworkError && typeof navigator !== "undefined" && navigator.onLine === false) return false;
  return failureCount < MAX_RETRIES;
}

export function createQueryClient(opts: { retry?: number | false } = {}): QueryClient {
  // React Query assumes "online" until it sees an event. Seed it from the browser so a page
  // opened offline refetches failed queries on the first "online" event (refetchOnReconnect).
  if (typeof navigator !== "undefined") onlineManager.setOnline(navigator.onLine !== false);
  return new QueryClient({
    queryCache: new QueryCache({
      // Fires once per query after its retries are exhausted.
      onError: (error) => {
        if (error instanceof NetworkError) pushToast("errors.NETWORK");
      },
    }),
    defaultOptions: {
      queries: {
        retry: opts.retry ?? shouldRetry,
        retryDelay,
        // Always attempt the fetch, even offline. The default ("online") pauses it instead,
        // which leaves an uncached day on an endless skeleton; failing fast shows the
        // no-connection error with Retry.
        networkMode: "always",
        // "always" turns refetchOnReconnect off by default; keep it so "online" reloads
        // failed or stale days without a manual retry.
        refetchOnReconnect: true,
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
    },
  });
}
