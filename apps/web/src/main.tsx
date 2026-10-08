import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import "./i18n";
import "./index.css";
import App from "./App";
import { createQueryClient } from "./queryClient";

const root = document.getElementById("root");
if (!root) throw new Error("#root missing");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={createQueryClient()}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);

if (import.meta.env.PROD) {
  import("./registerSw")
    .then((m) => m.registerServiceWorker())
    .catch(() => {
      // Offline support is an enhancement; never let it break the app.
    });
}
