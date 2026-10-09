import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** navigator.onLine, kept in sync with the browser's online/offline events. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine !== false,
    () => true,
  );
}

/**
 * Polite live region that says the app is offline. The region is always mounted so the
 * message is announced when it appears, not only when the page loads offline.
 */
export function OfflineBanner() {
  const { t } = useTranslation();
  const online = useOnline();
  return (
    <div role="status" aria-live="polite" className="empty:hidden">
      {!online && (
        <p className="border-b border-amber-300 bg-amber-100 px-4 py-2 text-center text-sm font-semibold text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          {t("offline.banner")}
        </p>
      )}
    </div>
  );
}
