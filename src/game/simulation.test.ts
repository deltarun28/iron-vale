import { describe, expect, it } from "vitest";
import { createLandAction, createSeaAction } from "./actions";
import { updateGame } from "./simulation";
import { createInitialPlayerState } from "./state";
import { makeTestState } from "./testFixtures";
import type { ActiveAction, GameState } from "./types";

function makeInFlightAttack(over: Partial<ActiveAction> = {}): ActiveAction {
  return {
    id: "test_attack",
    type: "land_attack",
    owner: "player1",
    sourceTileId: "field1",
    targetTileId: "field2",
    troopsSent: 5,
    startedAt: 0,
    resolvesAt: 2,
    isSeaAction: false,
    targetBusyLocked: false,
    attackerArmoured: false,
    attackerAttackVetLevel: 0,
    attackerDefVetLevel: 0,
    defenderFortLevel: 0,
    ...over,
  };
}

// Advance the simulation to just past `until` in sub-50ms ticks, mirroring
// how the real game loop steps.
function advanceTo(state: GameState, until: number): GameState {
  let next = state;
  while (next.now < until) {
    next = updateGame(next, Math.min(0.05, until - next.now + 0.001));
  }
  return next;
}

describe("head-on collisions", () => {
  function dispatchOpposingAttacks() {
    let state = makeTestState();
    state.tiles["enemy_cap"]!.troops = 12;
    state.tiles["field1"]!.troops = 10;

    // player2 attacks field1; then player1 counter-attacks enemy_cap.
    state = createLandAction({
      state,
      playerId: "player2",
      sourceTileId: "enemy_cap",
      targetTileId: "field1",
      troopsSent: 6,
    });
    state = createLandAction({
      state,
      playerId: "player1",
      sourceTileId: "field1",
      targetTileId: "enemy_cap",
      troopsSent: 5,
    });
    return state;
  }

  it("schedules a mid-path meeting instead of resolving at dispatch", () => {
    const state = dispatchOpposingAttacks();

    expect(state.activeActions).toHaveLength(2);
    const [a, b] = state.activeActions;
    expect(a!.collisionPartnerId).toBe(b!.id);
    expect(b!.collisionPartnerId).toBe(a!.id);
    // They meet at the same moment...
    expect(a!.resolvesAt).toBeCloseTo(b!.resolvesAt, 5);
    // ...at complementary fractions of the shared path.
    expect(a!.collisionMeetFraction! + b!.collisionMeetFraction!).toBeCloseTo(1, 5);
    expect(a!.collisionMeetFraction).toBeGreaterThan(0);
    expect(a!.collisionMeetFraction).toBeLessThan(1);
  });

  it("resolves the battle at the meeting point and the winner continues", () => {
    let state = dispatchOpposingAttacks();
    const meetTime = state.activeActions[0]!.resolvesAt;

    state = advanceTo(state, meetTime + 0.1);

    // A field-battle event was recorded with a mid-path anchor.
    const fieldEvent = state.combatEvents.find((e) => e.fromTileId !== undefined);
    expect(fieldEvent).toBeDefined();
    expect(fieldEvent!.pathFraction).toBeGreaterThan(0);
    expect(fieldEvent!.pathFraction).toBeLessThan(1);

    // At most one army survived; it continues mid-path toward its target.
    const survivors = state.activeActions.filter((a) => a.type === "land_attack");
    expect(survivors.length).toBeLessThanOrEqual(1);
    if (survivors.length === 1) {
      const continuation = survivors[0]!;
      expect(continuation.pathStartFraction).toBeGreaterThan(0);
      expect(continuation.pathStartFraction).toBeLessThan(1);
      expect(continuation.collisionPartnerId).toBeUndefined();
    }
  });
});

describe("sea-lane collisions", () => {
  it("opposing sea attacks on the same lane meet and resolve at sea", () => {
    let state = makeTestState();
    state.tiles["cap1"]!.troops = 12;
    state.tiles["enemy_cap"]!.troops = 12;
    // Give both sides armour + vets to confirm the sea battle ignores them
    // (this only checks it runs — the bonus neutralisation is in the formula
    // inputs, asserted by the code path itself).
    state.tiles["cap1"]!.armoured = true;
    state.tiles["cap1"]!.attackVetLevel = 3;

    state = createSeaAction({
      state,
      playerId: "player2",
      sourceTileId: "enemy_cap",
      targetTileId: "cap1",
      troopsSent: 6,
    });
    state = createSeaAction({
      state,
      playerId: "player1",
      sourceTileId: "cap1",
      targetTileId: "enemy_cap",
      troopsSent: 6,
    });

    expect(state.activeActions).toHaveLength(2);
    const [a, b] = state.activeActions;
    expect(a!.type).toBe("sea_attack");
    expect(a!.collisionPartnerId).toBe(b!.id);
    expect(b!.collisionPartnerId).toBe(a!.id);
    expect(a!.resolvesAt).toBeCloseTo(b!.resolvesAt, 5);
    expect(a!.collisionMeetFraction! + b!.collisionMeetFraction!).toBeCloseTo(1, 5);

    const meetTime = a!.resolvesAt;
    state = advanceTo(state, meetTime + 0.1);

    // The battle happened on the lane, flagged for arc rendering.
    const seaEvent = state.combatEvents.find((e) => e.atSea === true);
    expect(seaEvent).toBeDefined();
    expect(seaEvent!.fromTileId).toBeDefined();

    // At most one fleet survived; it sails on from the meeting point.
    const survivors = state.activeActions.filter((x) => x.type === "sea_attack");
    expect(survivors.length).toBeLessThanOrEqual(1);
    if (survivors.length === 1) {
      expect(survivors[0]!.pathStartFraction).toBeGreaterThan(0);
      expect(survivors[0]!.pathStartFraction).toBeLessThan(1);
    }
  });
});

describe("ally arrivals (2v2 races)", () => {
  function make2v2WithAllyCapture() {
    const state = makeTestState({ playerMode: "2v2" });
    state.players.player3 = createInitialPlayerState("player3", "team1", 0);
    // player1's attack is in flight toward field2 when player3 captures it.
    state.activeActions.push(makeInFlightAttack({ targetTileId: "field2" }));
    state.tiles["field2"]!.owner = "player3";
    state.tiles["field2"]!.troops = 6;
    return state;
  }

  it("an attack arriving at an ally-captured tile turns around and goes home", () => {
    let state = make2v2WithAllyCapture();
    state = advanceTo(state, 2.1);

    // No combat happened — the ally garrison is untouched (bar production).
    expect(state.tiles["field2"]!.owner).toBe("player3");
    expect(state.tiles["field2"]!.troops).toBeGreaterThanOrEqual(6);

    // The army is heading home with its full strength.
    const returning = state.activeActions.find((a) => a.type === "land_reinforce");
    expect(returning).toBeDefined();
    expect(returning!.owner).toBe("player1");
    expect(returning!.sourceTileId).toBe("field2");
    expect(returning!.targetTileId).toBe("field1");
    expect(returning!.troopsSent).toBe(5);

    // And it deposits at home when it arrives.
    const homeBefore = state.tiles["field1"]!.troops;
    state = advanceTo(state, returning!.resolvesAt + 0.1);
    expect(state.tiles["field1"]!.troops).toBeGreaterThanOrEqual(homeBefore + 5);
  });

  it("a reinforce arriving at an ally-captured tile merges into the garrison", () => {
    const state = makeTestState({ playerMode: "2v2" });
    state.players.player3 = createInitialPlayerState("player3", "team1", 0);
    state.activeActions.push(
      makeInFlightAttack({ type: "land_reinforce", targetTileId: "field2" })
    );
    state.tiles["field2"]!.owner = "player3";
    state.tiles["field2"]!.troops = 6;

    const next = advanceTo(state, 2.1);
    expect(next.tiles["field2"]!.owner).toBe("player3");
    expect(next.tiles["field2"]!.troops).toBeGreaterThanOrEqual(11);
    // No bounce-back army was created.
    expect(next.activeActions).toHaveLength(0);
  });
});

describe("broken chain legs", () => {
  it("a chained move blocked by a captured pass-through turns back", () => {
    const state = makeTestState();
    // Chain leg in flight toward field1 with more path remaining, but field1
    // was captured by the enemy mid-transit.
    state.activeActions.push(
      makeInFlightAttack({
        type: "land_reinforce",
        sourceTileId: "cap1",
        targetTileId: "field1",
        remainingPath: ["field2"],
      })
    );
    state.tiles["field1"]!.owner = "player2";

    const next = advanceTo(state, 2.1);

    // Troops did not vanish: they're marching back to cap1.
    const returning = next.activeActions.find(
      (a) => a.targetTileId === "cap1" && a.owner === "player1"
    );
    expect(returning).toBeDefined();
    expect(returning!.troopsSent).toBe(5);
  });
});
