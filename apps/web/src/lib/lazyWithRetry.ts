import { lazy, type ComponentType, type LazyExoticComponent } from "react";

export type RetryLoader<P> = {
  /** Shared, cached load; a failure clears the cache so the next call retries. */
  load: () => Promise<{ default: ComponentType<P> }>;
  /** A fresh React.lazy component (React.lazy caches a rejection forever, so create one per mount). */
  create: () => LazyExoticComponent<ComponentType<P>>;
};

export function lazyWithRetry<P>(loader: () => Promise<{ default: ComponentType<P> }>): RetryLoader<P> {
  let pending: Promise<{ default: ComponentType<P> }> | null = null;
  const load = () => {
    pending ??= loader().catch((e: unknown) => {
      pending = null;
      throw e;
    });
    return pending;
  };
  return { load, create: () => lazy(load) };
}
