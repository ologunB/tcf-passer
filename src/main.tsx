import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { App } from "./App";
import { db } from "./db";
import "./styles.css";

// Ask the browser not to evict our data when the phone runs low on storage.
navigator.storage?.persist?.();
registerSW({ immediate: true });

db.open().catch((e) => console.error("Could not open the local database", e));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
