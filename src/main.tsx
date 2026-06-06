/**
 * main.tsx — Application entry point.
 *
 * Validates the static map data before mounting so any adjacency errors
 * surface immediately in the console rather than causing silent runtime bugs
 * mid-game. The validation only runs once at startup and has no performance
 * impact on subsequent frames.
 */

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { validateIronValeMap } from "./game/ironValeMap";

const mapErrors = validateIronValeMap();
if (mapErrors.length > 0) {
  console.error("Iron Vale map validation failed:", mapErrors);
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);