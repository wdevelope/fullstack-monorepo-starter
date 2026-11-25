import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
import { client, queryClient } from "./lib/api.ts";
import { router } from "./router.tsx";

const root = createRoot(document.getElementById("root")!);

// 첫 렌더링 전에 리프레시 쿠키로 세션을 복원한다. 그래서 보호된 페이지가 로그인 리다이렉트로
// 잠깐 깜박이지 않는다. 네트워크가 실패하면 로그아웃 상태로 앱을 시작할 뿐이다.
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
