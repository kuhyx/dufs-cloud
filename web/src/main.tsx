import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@kuhyx/web-ui/tokens.css";
import "@kuhyx/web-ui/range-slider.css";

import { App } from "./app.tsx";
import "./index.css";

const root = document.getElementById("root");
if (root !== null) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
