import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.tsx";
import { queryClient } from "./lib/orpc.ts";
import { restoreSession } from "./lib/session.ts";
import "./styles.css";

// effect가 아니라 여기서 한 번 시작한다. 그래서 StrictMode가 복원을 두 번 일으킬 수 없다.
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
