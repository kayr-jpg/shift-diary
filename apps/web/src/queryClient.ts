import { QueryCache, QueryClient } from "@tanstack/react-query";
import { NetworkError } from "./api";
import { pushToast } from "./toasts";

/** 1s, 2s, 4s … capped at 10s. */
export const retryDelay = (attempt: number) => Math.min(1000 * 2 ** attempt, 10_000);

export function createQueryClient(opts: { retry?: number | false } = {}): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      // Fires once per query after its retries are exhausted.
      onError: (error) => {
        if (error instanceof NetworkError) pushToast("errors.NETWORK");
      },
    }),
    defaultOptions: {
      queries: {
        retry: opts.retry ?? 3,
        retryDelay,
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
    },
  });
}
