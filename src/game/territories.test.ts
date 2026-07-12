import { describe, expect, it } from "vitest";
import {
  getTerritoryBonus,
  getTerritoryController,
  type TerritoryDefinition,
} from "./territories";
import { makeTestState } from "./testFixtures";

const territory: TerritoryDefinition = {
  id: "test_territory",
  name: "Test Territory",
  tileIds: ["cap1", "field1"],
  bonusPerTile: 0.1,
};

describe("getTerritoryController", () => {
  it("returns the player when they hold every tile", () => {
    const state = makeTestState(); // cap1 and field1 both player1
    expect(getTerritoryController(territory, state.tiles)).toBe("player1");
  });

  it("returns null when ownership is split", () => {
    const state = makeTestState();
    state.tiles["field1"]!.owner = "player2";
    expect(getTerritoryController(territory, state.tiles)).toBeNull();
  });

  it("returns null when any tile is neutral or missing", () => {
    const state = makeTestState();
    state.tiles["field1"]!.owner = "neutral";
    expect(getTerritoryController(territory, state.tiles)).toBeNull();

    const missing: TerritoryDefinition = { ...territory, tileIds: ["cap1", "nope"] };
    expect(getTerritoryController(missing, makeTestState().tiles)).toBeNull();
  });
});

describe("getTerritoryBonus", () => {
  it("scales with tile count", () => {
    expect(getTerritoryBonus(territory)).toBeCloseTo(0.2);
  });
});
