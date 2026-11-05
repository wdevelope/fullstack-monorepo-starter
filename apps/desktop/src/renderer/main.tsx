import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.tsx";
import { queryClient } from "./lib/orpc.ts";
import { restoreSession } from "./lib/session.ts";
import "./styles.css";

// Started once here rather than in an effect, so StrictMode cannot trigger a second restore.
void restoreSession();

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root element");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
