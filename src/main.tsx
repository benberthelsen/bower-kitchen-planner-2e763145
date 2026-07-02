import { createRoot } from "react-dom/client";
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
