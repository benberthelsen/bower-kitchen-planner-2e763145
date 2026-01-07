import { createRoot } from "react-dom/client";
import { TradeRoomProvider } from "./contexts/TradeRoomContext";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <TradeRoomProvider>
    <App />
  </TradeRoomProvider>
);
