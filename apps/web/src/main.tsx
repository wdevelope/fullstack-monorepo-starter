import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
import { client, queryClient } from "./lib/api.ts";
import { router } from "./router.tsx";

const root = createRoot(document.getElementById("root")!);

// Restore the session from the refresh cookie before the first render, so protected pages do
// not flash a sign-in redirect. A network failure just starts the app signed out.
client
  .restore()
  .catch(() => null)
  .finally(() => {
    root.render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </StrictMode>,
    );
  });
