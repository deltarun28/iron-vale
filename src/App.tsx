/**
 * App.tsx — Root component and top-level screen router.
 *
 * Manages which screen is visible ("start" or "game") and passes the chosen
 * difficulty, map size, and player mode down to GameScreen. Also holds the
 * save-exists flag so the start screen can show the Continue button.
 */

import { useState } from "react";
import { clearSavedGame, hasSavedGame, loadSavedGame } from "./game/storage";
import type { Difficulty, GameState, MapId, MapTheme, PlayerMode } from "./game/types";
import { GameScreen } from "./ui/GameScreen";
import { StartScreen } from "./ui/StartScreen";
import { UpdatePrompt } from "./ui/UpdatePrompt";
import "./styles.css";

type Screen = "start" | "game";

export default function App() {
  const [screen, setScreen] = useState<Screen>("start");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [mapId, setMapId] = useState<MapId>("river_crown");
  const [mapTheme, setMapTheme] = useState<MapTheme>("default");
  const [playerMode, setPlayerMode] = useState<PlayerMode>("1v1");
  const [initialState, setInitialState] = useState<GameState | undefined>(undefined);
  const [saveExists, setSaveExists] = useState(() => hasSavedGame());

  function pickMapTheme(): MapTheme {
    const roll = Math.random();
    if (roll < 0.70) return "default";
    if (roll < 0.85) return "autumn";
    return "winter";
  }

  /** Clears any existing save and starts a fresh game with the chosen settings. */
  function handlePlay(chosen: Difficulty, chosenMapId: MapId, chosenMode: PlayerMode): void {
    clearSavedGame();
    setSaveExists(false);
    setDifficulty(chosen);
    setMapId(chosenMapId);
    setMapTheme(pickMapTheme());
    setPlayerMode(chosenMode);
    setInitialState(undefined);
    setScreen("game");
  }

  /** Loads the saved game and resumes it. Ignores stale or invalid saves. */
  function handleContinue(): void {
    const saved = loadSavedGame();
    if (!saved || saved.phase !== "playing") return;
    setInitialState(saved);
    setDifficulty(saved.ai.difficulty);
    setMapId(saved.mapId ?? "river_crown");
    setPlayerMode(saved.playerMode);
    setScreen("game");
  }

  /** Returns to the start screen and clears the save so no stale state persists. */
  function handleReturnToMenu(): void {
    clearSavedGame();
    setSaveExists(false);
    setInitialState(undefined);
    setScreen("start");
  }

  if (screen === "start") {
    return (
      <>
        <StartScreen
          hasSave={saveExists}
          onPlay={handlePlay}
          onContinue={handleContinue}
        />
        <UpdatePrompt />
      </>
    );
  }

  return (
    <>
      <GameScreen
        difficulty={difficulty}
        mapId={mapId}
        mapTheme={mapTheme}
        playerMode={playerMode}
        onReturnToMenu={handleReturnToMenu}
        {...(initialState !== undefined ? { initialState } : {})}
      />
      <UpdatePrompt />
    </>
  );
}
