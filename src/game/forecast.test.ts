import { describe, expect, it } from "vitest";
import { forecastAttack, projectDefenderTroopsAtArrival } from "./forecast";
import { makeTestState } from "./testFixtures";

describe("projectDefenderTroopsAtArrival", () => {
  it("adds production over the travel time, capped at the tile ceiling", () => {
    const state = makeTestState();
    const target = state.tiles["enemy_cap"]!;
    const targetDef = state.tileDefinitions["enemy_cap"]!;
    const now = projectDefenderTroopsAtArrival(state, target, targetDef, 0);
    const later = projectDefenderTroopsAtArrival(state, target, targetDef, 6);
    expect(later).toBeGreaterThan(now);
    // Never projects above the production cap.
    const far = projectDefenderTroopsAtArrival(state, target, targetDef, 10_000);
    expect(far).toBeLessThanOrEqual(25); // capital stopsAt
  });

  it("counts friendly reinforcements that land before the attack", () => {
    const state = makeTestState();
    const target = state.tiles["enemy_cap"]!;
    const targetDef = state.tileDefinitions["enemy_cap"]!;
    state.activeActions.push({
      id: "r1",
      type: "land_reinforce",
      owner: "player2",
      sourceTileId: "field2",
      targetTileId: "enemy_cap",
      troopsSent: 5,
      startedAt: 0,
      resolvesAt: 2,
      isSeaAction: false,
      targetBusyLocked: true,
      attackerArmoured: false,
      attackerAttackVetLevel: 0,
      attackerDefVetLevel: 0,
      defenderFortLevel: 0,
    });
    const before = projectDefenderTroopsAtArrival(state, target, targetDef, 1);
    const after = projectDefenderTroopsAtArrival(state, target, targetDef, 3);
    expect(after - before).toBeGreaterThanOrEqual(5);
  });
});

describe("forecastAttack", () => {
  it("routes coastal lane-connected tiles by sea", () => {
    const state = makeTestState();
    const forecast = forecastAttack({
      state,
      sourceTileId: "cap1",
      targetTileId: "enemy_cap",
      troopsSent: 5,
    });
    expect(forecast).not.toBeNull();
    expect(forecast!.isSea).toBe(true);
  });

  it("routes adjacent inland tiles by land and bounds the probability", () => {
    const state = makeTestState();
    state.tiles["field1"]!.owner = "player2";
    const forecast = forecastAttack({
      state,
      sourceTileId: "cap1",
      targetTileId: "field1",
      troopsSent: 8,
    });
    expect(forecast).not.toBeNull();
    expect(forecast!.isSea).toBe(false);
    expect(forecast!.winProbability).toBeGreaterThanOrEqual(0);
    expect(forecast!.winProbability).toBeLessThanOrEqual(1);
  });
});
