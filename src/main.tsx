import { createRoot } from "react-dom/client";
import { handleVitePreloadError } from "./lib/deploymentRecovery";
import { TradeRoomProvider } from "./contexts/TradeRoomContext";
import App from "./App.tsx";
import "./index.css";

// A tab left open during a deployment can retain an old hashed chunk name.
// Fetch the current document with a one-shot cache-busting URL instead of
// repeatedly retrying the stale module graph.
window.addEventListener("vite:preloadError", handleVitePreloadError);

// Canonical active planner state tree for /trade/*.
// Legacy PlannerContext is intentionally NOT mounted at app root.
createRoot(document.getElementById("root")!).render(
  <TradeRoomProvider>
    <App />
  </TradeRoomProvider>
);
