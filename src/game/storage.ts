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

import { getIronValeTileDefinitions } from "./ironValeMap";
import type { GameState } from "./types";

const SAVE_KEY = "iron_vale_save";
const SAVE_VERSION = 11; // bumped: chain-move remainingPath bleed fix; clears saves with phantom C→C actions

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
    // cause a mismatch if the map file has been updated since the save.
    save.state.tileDefinitions = getIronValeTileDefinitions();

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
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("version" in parsed) ||
      !("state" in parsed)
    ) {
      return false;
    }
    const save = parsed as SaveFile;
    return save.version === SAVE_VERSION && save.state.phase === "playing";
  } catch {
    return false;
  }
}
