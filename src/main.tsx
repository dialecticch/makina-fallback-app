import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";

import "./index.css";
import App from "@/App";
import { ErrorBoundary } from "@/components/error-boundary";
import { clearCacheAndReload } from "@/lib/query-client";
import { initTheme } from "@/lib/theme";
import { router } from "@/router";

const root = document.getElementById("root")!;

if (window.top !== window.self) {
  // Refuse to run inside a frame: another site could overlay it and trick clicks into signing (clickjacking). A
  // meta CSP cannot carry `frame-ancestors`, so this also covers hosts that do not send the header.
  root.textContent = "This app cannot run inside a frame. Open it in its own tab.";
} else {
  initTheme();
  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary label="The app" action={{ label: "Clear cache and reload", onClick: clearCacheAndReload }}>
        <App>
          <RouterProvider router={router} />
        </App>
      </ErrorBoundary>
    </StrictMode>,
  );
}
