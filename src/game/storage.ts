/**
 * storage.ts — Save and load game state via localStorage.
 *
 * The save file is a versioned JSON envelope. If the stored version doesn't
 * match SAVE_VERSION the save is discarded (incompatible format) rather than
 * trying to migrate it. Bump SAVE_VERSION whenever a GameState schema change
 * would break existing saves.
 *
 * tileDefinitions are always regenerated from the map source on load so stale
 * JSON can't cause a mismatch if the map file has changed since the save was
 * written.
 */

import { getMapConfig } from "./maps";
import type { GameState } from "./types";

const SAVE_KEY = "iron_vale_save";
const SAVE_VERSION = 14; // bumped: combatEvents, timeline, per-player loss tracking in GameState

interface SaveFile {
  version: number;
  state: GameState;
}

/** Serialises the current game state to localStorage. Silently ignores storage errors. */
export function saveGame(state: GameState): void {
  try {
    const save: SaveFile = { version: SAVE_VERSION, state };
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Storage unavailable or full — ignore silently.
  }
}

/**
 * Loads and validates the save file from localStorage.
 * Returns null if there is no save, if the version is stale, or if the JSON
 * is malformed. On success, tileDefinitions are replaced with fresh map data.
 */
export function loadSavedGame(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("version" in parsed) ||
      !("state" in parsed)
    ) {
      return null;
    }

    const save = parsed as SaveFile;

    if (save.version !== SAVE_VERSION) {
      return null;
    }

    // Always regenerate tileDefinitions from map source so stale JSON can't
    // cause a mismatch if the map file has been updated since the save —
    // from the map the save was created on, then re-apply the capital
    // promotions made at match creation (starting tiles are towns in the
    // source data and are promoted per player).
    const tileDefinitions = getMapConfig(
      save.state.mapId ?? "river_crown"
    ).getTileDefinitions();
    for (const tileId of save.state.capitalTileIds ?? []) {
      const definition = tileDefinitions[tileId];
      if (definition) {
        tileDefinitions[tileId] = {
          ...definition,
          isCapital: true,
          isTown: false,
        };
      }
    }
    save.state.tileDefinitions = tileDefinitions;

    return save.state;
  } catch {
    return null;
  }
}

/** Removes the save file from localStorage. */
export function clearSavedGame(): void {
  localStorage.removeItem(SAVE_KEY);
}

/**
 * Returns true if there is a valid in-progress save in localStorage.
 * Used by the start screen to decide whether to show the Continue button.
 */
export function hasSavedGame(): boolean {
  const saved = loadSavedGame();
  return saved !== null && saved.phase === "playing";
}
