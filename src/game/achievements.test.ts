import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkAndUnlockAchievements } from "./achievements";
import { loadStats, recordGameResult } from "./stats";
import { makeTestState } from "./testFixtures";

// achievements persist via stats.ts → localStorage; back it with a Map in Node.
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

describe("checkAndUnlockAchievements", () => {
  it("a first hard win unlocks First Victory, Iron Will, and Blitz", () => {
    const state = makeTestState();
    state.ai.difficulty = "hard";
    state.now = 95; // under 2 minutes
    recordGameResult(true, state.now, state.mapId, "hard", state.playerMode);

    const unlocked = checkAndUnlockAchievements({
      state,
      won: true,
      humanPlayerId: "player1",
    });

    const ids = unlocked.map((def) => def.id);
    expect(ids).toContain("first_win");
    expect(ids).toContain("hard_win");
    expect(ids).toContain("fast_win");
    // Never lost a tile in this fixture → flawless too.
    expect(ids).toContain("flawless_win");
  });

  it("does not re-unlock achievements on later games", () => {
    const state = makeTestState();
    recordGameResult(true, 300, state.mapId, "normal", state.playerMode);
    const first = checkAndUnlockAchievements({ state, won: true, humanPlayerId: "player1" });
    expect(first.map((d) => d.id)).toContain("first_win");

    recordGameResult(true, 300, state.mapId, "normal", state.playerMode);
    const second = checkAndUnlockAchievements({ state, won: true, humanPlayerId: "player1" });
    expect(second.map((d) => d.id)).not.toContain("first_win");
  });

  it("a loss unlocks nothing win-gated", () => {
    const state = makeTestState();
    recordGameResult(false, 300, state.mapId, "normal", state.playerMode);
    const unlocked = checkAndUnlockAchievements({ state, won: false, humanPlayerId: "player1" });
    expect(unlocked.map((d) => d.id)).not.toContain("first_win");
    expect(loadStats().achievements["first_win"]).toBeUndefined();
  });
});
