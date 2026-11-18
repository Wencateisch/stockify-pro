import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { App } from "./App";

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

// Hand the screen over to the app once React has painted.
requestAnimationFrame(() => {
  const boot = document.getElementById("boot");
  if (!boot) return;
  boot.style.opacity = "0";
  window.setTimeout(() => boot.remove(), 380);
});
