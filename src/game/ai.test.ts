import { describe, expect, it } from "vitest";
import { updateAI } from "./ai";
import { makeTestState } from "./testFixtures";

// Smoke tests: the AI think cycle runs and produces sensible behaviour on the
// fixture map. Full-game behaviour is exercised by scripts/simulate.ts.
describe("updateAI", () => {
  it("does nothing before its think timer elapses", () => {
    const state = makeTestState();
    state.ai.nextThinkAt = 100;
    const next = updateAI(state);
    expect(next).toBe(state);
  });

  it("hard AI attacks a weak adjacent tile when it can win", () => {
    const state = makeTestState();
    state.ai.difficulty = "hard";
    state.ai.nextThinkAt = 0;
    // player2's capital has a big garrison next to player1's weak field1.
    state.tiles["enemy_cap"]!.troops = 20;
    state.tiles["field1"]!.troops = 2;

    const next = updateAI(state);

    expect(next.activeActions.length).toBeGreaterThan(0);
    expect(next.activeActions.every((a) => a.owner === "player2")).toBe(true);
    // The think timer advanced so it doesn't re-run every tick.
    expect(next.ai.nextThinkAt).toBeGreaterThan(state.now);
  });

  it("hard AI does not launch hopeless attacks", () => {
    const state = makeTestState();
    state.ai.difficulty = "hard";
    state.ai.nextThinkAt = 0;
    // player2 is badly outnumbered everywhere; fort makes it worse.
    state.tiles["enemy_cap"]!.troops = 6;
    state.tiles["field1"]!.troops = 25;
    state.tiles["field1"]!.fortLevel = 4;
    state.tiles["field2"]!.owner = "player1";
    state.tiles["field2"]!.troops = 25;
    state.tiles["field2"]!.fortLevel = 4;

    const next = updateAI(state);

    // No attack candidates clear the win-probability floor.
    const attacks = next.activeActions.filter(
      (a) => a.type === "land_attack" || a.type === "sea_attack"
    );
    expect(attacks).toHaveLength(0);
  });
});
