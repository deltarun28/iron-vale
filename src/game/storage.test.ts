import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialGameState } from "./state";
import { clearSavedGame, hasSavedGame, loadSavedGame, saveGame } from "./storage";

// vitest runs in Node, which has no localStorage — back it with a Map.
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    store.set(key, value);
  },
  removeItem: (key: string) => {
    store.delete(key);
  },
});

beforeEach(() => {
  store.clear();
});

describe("save/load round trip", () => {
  it("preserves the promoted capitals", () => {
    const state = createInitialGameState("normal", "1v1", "river_crown");
    state.phase = "playing";
    expect(state.capitalTileIds).toHaveLength(2);

    saveGame(state);
    const loaded = loadSavedGame();

    expect(loaded).not.toBeNull();
    for (const tileId of state.capitalTileIds) {
      const definition = loaded!.tileDefinitions[tileId];
      expect(definition?.isCapital).toBe(true);
      expect(definition?.isTown).toBe(false);
    }
  });

  it("regenerates definitions for the map the save was created on", () => {
    const state = createInitialGameState("hard", "1v1v1", "borderlands");
    state.phase = "playing";
    saveGame(state);

    const loaded = loadSavedGame();
    expect(loaded).not.toBeNull();
    expect(loaded!.mapId).toBe("borderlands");
    // Borderlands definitions must survive the reload, not Iron Vale's.
    expect(Object.keys(loaded!.tileDefinitions).every((id) => id.startsWith("bl_"))).toBe(true);
  });

  it("preserves the map theme", () => {
    const state = createInitialGameState("normal", "1v1", "river_crown", "winter");
    state.phase = "playing";
    saveGame(state);
    expect(loadSavedGame()!.mapTheme).toBe("winter");
  });

  it("hasSavedGame only reports in-progress games", () => {
    expect(hasSavedGame()).toBe(false);

    const state = createInitialGameState();
    state.phase = "playing";
    saveGame(state);
    expect(hasSavedGame()).toBe(true);

    clearSavedGame();
    expect(hasSavedGame()).toBe(false);
  });

  it("rejects malformed and stale-version saves", () => {
    store.set("iron_vale_save", "not json{");
    expect(loadSavedGame()).toBeNull();

    store.set("iron_vale_save", JSON.stringify({ version: -1, state: {} }));
    expect(loadSavedGame()).toBeNull();
  });
});
