import { Component, Suspense, useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { lazyWithRetry, type RetryLoader } from "../lib/lazyWithRetry";
import { pushToast } from "../toasts";
import type { Receipt } from "./Receipt";

type ReceiptProps = ComponentProps<typeof Receipt>;

// Receipt pulls in Motion; load it only when a shift is closed (or likely to be).
export const receiptSource = lazyWithRetry<ReceiptProps>(() =>
  import("./Receipt").then((m) => ({ default: m.Receipt })),
);

/** Warm the chunk; failures are ignored here and surface on the real open. */
export function preloadReceipt(): void {
  void receiptSource.load().catch(() => {});
}

const NOOP = () => {};

class LoadBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function Pending({ onBusy }: { onBusy: (busy: boolean) => void }) {
  useEffect(() => {
    onBusy(true);
    return () => onBusy(false);
  }, [onBusy]);
  return null;
}

/** Renders the lazily loaded Receipt; a failed chunk load toasts and closes instead of blanking the app. */
export function LazyReceipt({
  source = receiptSource,
  onBusy,
  onClose,
  ...props
}: Omit<ReceiptProps, "open"> & { source?: RetryLoader<ReceiptProps>; onBusy?: (busy: boolean) => void }) {
  const [Lazy] = useState(() => source.create());
  return (
    <LoadBoundary
      onError={() => {
        pushToast("receipt.loadFailed");
        onClose();
      }}
    >
      <Suspense fallback={<Pending onBusy={onBusy ?? NOOP} />}>
        <Lazy {...props} open onClose={onClose} />
      </Suspense>
    </LoadBoundary>
  );
}
