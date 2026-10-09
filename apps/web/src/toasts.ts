import { useSyncExternalStore } from "react";

/** A toast carries an i18n key, never pre-translated text, so it follows language changes. */
export type Toast = { id: number; key: string };

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function pushToast(key: string): void {
  // One visible toast per message: repeated failures should not stack up.
  if (toasts.some((t) => t.key === key)) return;
  toasts = [...toasts, { id: nextId++, key }];
  emit();
}

export function dismissToast(id: number): void {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(subscribe, () => toasts);
}
