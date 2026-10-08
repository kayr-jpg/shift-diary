import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { dismissToast, useToasts, type Toast } from "../toasts";
import { CloseIcon } from "./Icons";

const AUTO_DISMISS_MS = 6000;

function ToastItem({ toast }: { toast: Toast }) {
  const { t } = useTranslation();
  useEffect(() => {
    const id = setTimeout(() => dismissToast(toast.id), AUTO_DISMISS_MS);
    return () => clearTimeout(id);
  }, [toast.id]);
  return (
    <div className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-zinc-900 py-2 pl-4 pr-2 text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900">
      <p className="flex-1 text-sm font-medium">{t(toast.key)}</p>
      <button
        type="button"
        onClick={() => dismissToast(toast.id)}
        aria-label={t("toast.dismiss")}
        className="grid size-11 place-items-center rounded-full hover:bg-white/10 dark:hover:bg-black/10"
      >
        <CloseIcon className="size-5" />
      </button>
    </div>
  );
}

export function Toasts() {
  const toasts = useToasts();
  return (
    <div
      data-testid="toasts"
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 mx-auto flex max-w-md flex-col gap-2 px-4"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
