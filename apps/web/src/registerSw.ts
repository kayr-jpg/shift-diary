/// <reference types="vite-plugin-pwa/client" />
// Only imported from main.tsx in production builds; tests never load the virtual module.
import { registerSW } from "virtual:pwa-register";

export function registerServiceWorker(): void {
  try {
    registerSW({ immediate: true });
  } catch {
    // No service worker (unsupported browser, private mode): the app still works online.
  }
}
