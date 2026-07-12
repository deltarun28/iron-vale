import { describe, expect, it } from "vitest";
import {
  calculateSeaCost,
  findSeaLaneBetween,
  validateLandAction,
  validateSeaAction,
} from "./movement";
import { createInitialPlayerState } from "./state";
import { makeDef, makeTestState, makeTile } from "./testFixtures";
import type { SeaLane } from "./types";

describe("validateLandAction", () => {
  it("accepts a reinforce between adjacent owned tiles", () => {
    const state = makeTestState();
    const result = validateLandAction({
      state,
      playerId: "player1",
      sourceTileId: "cap1",
      targetTileId: "field1",
      troopsSent: 5,
    });
    expect(result.valid).toBe(true);
  });

  it("rejects a source the player does not own", () => {
    const state = makeTestState();
    const result = validateLandAction({
      state,
      playerId: "player1",
      sourceTileId: "field2", // neutral
      targetTileId: "cap1",
      troopsSent: 1,
    });
    expect(result.valid).toBe(false);
  });

  it("rejects non-adjacent targets", () => {
    const state = makeTestState();
    const result = validateLandAction({
      state,
      playerId: "player1",
      sourceTileId: "cap1",
      targetTileId: "enemy_cap", // not in cap1.adjacent
      troopsSent: 5,
    });
    expect(result.valid).toBe(false);
  });

  it("rejects sending zero troops or the whole garrison", () => {
    const state = makeTestState();
    const zero = validateLandAction({
      state,
      playerId: "player1",
      sourceTileId: "cap1",
      targetTileId: "field1",
      troopsSent: 0,
    });
    const all = validateLandAction({
      state,
      playerId: "player1",
      sourceTileId: "cap1",
      targetTileId: "field1",
      troopsSent: 10, // cap1 has exactly 10
    });
    expect(zero.valid).toBe(false);
    expect(all.valid).toBe(false);
  });

  it("rejects a busy source tile", () => {
    const state = makeTestState();
    state.tiles["cap1"]!.busyUntil = 10;
    const result = validateLandAction({
      state,
      playerId: "player1",
      sourceTileId: "cap1",
      targetTileId: "field1",
      troopsSent: 5,
    });
    expect(result.valid).toBe(false);
  });

  it("rejects targeting a teammate's tile in team modes", () => {
    const state = makeTestState({ playerMode: "2v2" });
    state.players.player3 = createInitialPlayerState("player3", "team1", 0);
    state.tiles["field1"]!.owner = "player3";
    const result = validateLandAction({
      state,
      playerId: "player1",
      sourceTileId: "cap1",
      targetTileId: "field1",
      troopsSent: 5,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/teammate/i);
  });
});

describe("validateSeaAction", () => {
  it("accepts an affordable attack along a sea lane", () => {
    const state = makeTestState();
    const result = validateSeaAction({
      state,
      playerId: "player1",
      sourceTileId: "cap1",
      targetTileId: "enemy_cap",
      troopsSent: 5,
    });
    expect(result.valid).toBe(true);
  });

  it("rejects coastal tiles with no connecting lane", () => {
    const state = makeTestState();
    const result = validateSeaAction({
      state,
      playerId: "player1",
      sourceTileId: "cap1",
      targetTileId: "field2", // coastal but no lane
      troopsSent: 5,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/lane/i);
  });

  it("rejects a source on embark cooldown", () => {
    const state = makeTestState();
    state.tiles["cap1"]!.embarkCooldownUntil = 5;
    const result = validateSeaAction({
      state,
      playerId: "player1",
      sourceTileId: "cap1",
      targetTileId: "enemy_cap",
      troopsSent: 5,
    });
    expect(result.valid).toBe(false);
  });

  it("rejects when the player cannot afford the crossing", () => {
    const state = makeTestState();
    state.players.player1!.gold = 0;
    const result = validateSeaAction({
      state,
      playerId: "player1",
      sourceTileId: "cap1",
      targetTileId: "enemy_cap",
      troopsSent: 5,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/gold/i);
  });
});

describe("calculateSeaCost", () => {
  it("small friendly town-to-town reinforcement is free", () => {
    const town = makeDef("a", { isTown: true, coastal: true });
    const otherTown = makeDef("b", { isTown: true, coastal: true });
    const result = calculateSeaCost({
      troopsSent: 5,
      sourceDefinition: town,
      sourceState: makeTile("a", "player1", 10),
      targetDefinition: otherTown,
      targetState: makeTile("b", "player1", 4),
    });
    expect(result.cost).toBe(0);
    expect(result.freeTownToTown).toBe(true);
  });

  it("town origin halves the cost", () => {
    const town = makeDef("a", { isTown: true, coastal: true });
    const plain = makeDef("b", { coastal: true });
    const fromTown = calculateSeaCost({
      troopsSent: 40,
      sourceDefinition: town,
      sourceState: makeTile("a", "player1", 50),
      targetDefinition: plain,
      targetState: makeTile("b", "player2", 5),
    });
    const fromPlain = calculateSeaCost({
      troopsSent: 40,
      sourceDefinition: plain,
      sourceState: makeTile("b", "player1", 50),
      targetDefinition: town,
      targetState: makeTile("a", "player2", 5),
    });
    expect(fromTown.discounted).toBe(true);
    expect(fromTown.cost).toBe(Math.ceil(fromPlain.baseCost / 2));
  });

  it("cost is capped at the maximum", () => {
    const plain = makeDef("a", { coastal: true });
    const other = makeDef("b", { coastal: true });
    const result = calculateSeaCost({
      troopsSent: 500,
      sourceDefinition: plain,
      sourceState: makeTile("a", "player1", 600),
      targetDefinition: other,
      targetState: makeTile("b", "player2", 5),
    });
    expect(result.cost).toBe(8);
  });
});

describe("findSeaLaneBetween", () => {
  const lanes: SeaLane[] = [
    { id: "l1", from: "a", to: "b", distance: 2, bidirectional: true },
    { id: "l2", from: "c", to: "d", distance: 2, bidirectional: false },
  ];

  it("finds lanes in both directions when bidirectional", () => {
    expect(findSeaLaneBetween(lanes, "a", "b")?.id).toBe("l1");
    expect(findSeaLaneBetween(lanes, "b", "a")?.id).toBe("l1");
  });

  it("one-way lanes only match in their stored direction", () => {
    expect(findSeaLaneBetween(lanes, "c", "d")?.id).toBe("l2");
    expect(findSeaLaneBetween(lanes, "d", "c")).toBeNull();
  });
});
