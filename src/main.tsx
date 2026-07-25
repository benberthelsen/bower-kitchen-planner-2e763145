import { createRoot } from "react-dom/client";

// Deploy resilience: every deploy renames the hashed chunk files, so a tab
// opened BEFORE a deploy can request a chunk that no longer exists
// ("Failed to fetch dynamically imported module"). Vite signals this with
// vite:preloadError — reload once to pick up the fresh index.html. The
// sessionStorage guard prevents a reload loop if the network is truly down.
window.addEventListener("vite:preloadError", (event) => {
  const KEY = "bower.chunkReloadAt";
  const last = Number(sessionStorage.getItem(KEY) ?? 0);
  if (Date.now() - last < 30_000) return; // already tried recently — let the error surface
  sessionStorage.setItem(KEY, String(Date.now()));
  event.preventDefault();
  window.location.reload();
});
import { TradeRoomProvider } from "./contexts/TradeRoomContext";
import App from "./App.tsx";
import "./index.css";

// Canonical active planner state tree for /trade/*.
// Legacy PlannerContext is intentionally NOT mounted at app root.
createRoot(document.getElementById("root")!).render(
  <TradeRoomProvider>
    <App />
  </TradeRoomProvider>
);
