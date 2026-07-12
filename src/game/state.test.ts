import { describe, expect, it } from "vitest";
import {
  areAllies,
  checkWinCondition,
  cloneGameState,
  createInitialPlayerState,
  getOpponents,
  getTeammates,
} from "./state";
import { makeTestState } from "./testFixtures";
import type { ActiveAction } from "./types";

describe("checkWinCondition", () => {
  it("keeps playing while two teams hold tiles", () => {
    const state = checkWinCondition(makeTestState());
    expect(state.phase).toBe("playing");
    expect(state.winningTeam).toBeNull();
  });

  it("ends the match when only one team holds tiles", () => {
    const state = makeTestState();
    state.tiles["enemy_cap"]!.owner = "player1";
    const next = checkWinCondition(state);
    expect(next.phase).toBe("ended");
    expect(next.winningTeam).toBe("team1");
  });

  it("troops in flight keep an otherwise-eliminated team alive", () => {
    const state = makeTestState();
    state.tiles["enemy_cap"]!.owner = "player1";
    const inFlight: ActiveAction = {
      id: "a1",
      type: "land_attack",
      owner: "player2",
      sourceTileId: "enemy_cap",
      targetTileId: "field1",
      troopsSent: 5,
      startedAt: 0,
      resolvesAt: 2,
      isSeaAction: false,
      targetBusyLocked: false,
      attackerArmoured: false,
      attackerAttackVetLevel: 0,
      attackerDefVetLevel: 0,
      defenderFortLevel: 0,
    };
    state.activeActions.push(inFlight);
    const next = checkWinCondition(state);
    expect(next.phase).toBe("playing");
  });
});

describe("cloneGameState", () => {
  it("mutating the clone leaves the original untouched", () => {
    const original = makeTestState();
    const clone = cloneGameState(original);

    clone.tiles["cap1"]!.troops = 999;
    clone.players.player1!.gold = 999;
    clone.ai.byPlayer.player2!.stance = "aggressive";
    clone.activeActions.push({} as ActiveAction);

    expect(original.tiles["cap1"]!.troops).toBe(10);
    expect(original.players.player1!.gold).toBe(5);
    expect(original.ai.byPlayer.player2!.stance).toBe("balanced");
    expect(original.activeActions).toHaveLength(0);
  });
});

describe("team helpers", () => {
  function make2v2() {
    const state = makeTestState({ playerMode: "2v2" });
    state.players.player3 = createInitialPlayerState("player3", "team1", 0);
    state.players.player4 = createInitialPlayerState("player4", "team2", 0);
    return state;
  }

  it("areAllies matches same-team players and self, never neutral", () => {
    const state = make2v2();
    expect(areAllies(state, "player1", "player3")).toBe(true);
    expect(areAllies(state, "player1", "player1")).toBe(true);
    expect(areAllies(state, "player1", "player2")).toBe(false);
    expect(areAllies(state, "player1", "neutral")).toBe(false);
  });

  it("getOpponents and getTeammates split the roster by team", () => {
    const state = make2v2();
    expect(getOpponents(state, "player1").sort()).toEqual(["player2", "player4"]);
    expect(getTeammates(state, "player1")).toEqual(["player3"]);
  });
});
