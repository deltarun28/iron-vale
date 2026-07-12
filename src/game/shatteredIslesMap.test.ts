import { describe, expect, it } from "vitest";
import {
  SHATTERED_ISLES_STARTING_TILES,
  getShatteredIslesTileDefinitions,
  shatteredIslesSeaLanes,
} from "./shatteredIslesMap";
import { createInitialGameState } from "./state";

const defs = getShatteredIslesTileDefinitions();
const tiles = Object.values(defs);

describe("Shattered Isles map data", () => {
  it("has 23 tiles: four 4-tile town islands and a 7-tile centre", () => {
    expect(tiles).toHaveLength(23);
    expect(tiles.filter((t) => t.isTown)).toHaveLength(4);
    // The centre island has no town: 4 landings + 2 forests + 1 peak.
    const centre = tiles.filter(
      (t) => t.id.startsWith("si_landing") || t.id.startsWith("si_heart")
    );
    expect(centre).toHaveLength(7);
    expect(centre.every((t) => !t.isTown)).toBe(true);
    expect(defs["si_heart_peak"]!.terrain).toBe("mountain");
  });

  it("every tile is coastal (it's all islands)", () => {
    expect(tiles.every((t) => t.coastal)).toBe(true);
  });

  it("adjacency is symmetric and only within an island", () => {
    for (const tile of tiles) {
      for (const adjId of tile.adjacent) {
        const adj = defs[adjId];
        expect(adj, `${tile.id} lists unknown neighbour ${adjId}`).toBeDefined();
        expect(
          adj!.adjacent.includes(tile.id),
          `${adjId} is missing reverse adjacency to ${tile.id}`
        ).toBe(true);
      }
    }
  });

  it("islands are land-disconnected: BFS from a town reaches exactly its island", () => {
    function reachable(startId: string): Set<string> {
      const seen = new Set([startId]);
      const queue = [startId];
      while (queue.length > 0) {
        const id = queue.shift()!;
        for (const adj of defs[id]!.adjacent) {
          if (!seen.has(adj)) {
            seen.add(adj);
            queue.push(adj);
          }
        }
      }
      return seen;
    }

    expect(reachable("si_nw_town").size).toBe(4);
    expect(reachable("si_landing_nw").size).toBe(7);
  });

  it("has 8 lanes: each outer island 3 routes, the centre 4", () => {
    expect(shatteredIslesSeaLanes).toHaveLength(8);
    expect(shatteredIslesSeaLanes.every((lane) => lane.bidirectional)).toBe(true);

    // Count lanes touching each island (tiles share the island prefix).
    const lanesTouching = (prefix: string) =>
      shatteredIslesSeaLanes.filter(
        (lane) => lane.from.startsWith(prefix) || lane.to.startsWith(prefix)
      ).length;

    expect(lanesTouching("si_nw_")).toBe(3);
    expect(lanesTouching("si_ne_")).toBe(3);
    expect(lanesTouching("si_sw_")).toBe(3);
    expect(lanesTouching("si_se_")).toBe(3);
    expect(lanesTouching("si_landing_")).toBe(4);
    // The peak and heart forests have no lanes — land assault only.
    expect(lanesTouching("si_heart_")).toBe(0);

    // Every lane endpoint exists and is coastal; no tile hosts two lanes.
    const endpointCounts = new Map<string, number>();
    for (const lane of shatteredIslesSeaLanes) {
      for (const end of [lane.from, lane.to]) {
        expect(defs[end], `lane ${lane.id} endpoint ${end}`).toBeDefined();
        expect(defs[end]!.coastal).toBe(true);
        endpointCounts.set(end, (endpointCounts.get(end) ?? 0) + 1);
      }
    }
    for (const [tileId, count] of endpointCounts) {
      expect(count, `${tileId} hosts more than one lane`).toBe(1);
      // Towns are the protected heart of each island — no lanes attach to them.
      expect(defs[tileId]!.isTown).toBe(false);
    }
  });

  it("creates a valid game: every player spawns with a capital on a town island", () => {
    const state = createInitialGameState("normal", "1v1v1v1", "shattered_isles");
    expect(state.capitalTileIds).toHaveLength(4);
    for (const capitalId of state.capitalTileIds) {
      expect(SHATTERED_ISLES_STARTING_TILES.some((s) => s.id === capitalId)).toBe(true);
      expect(state.tileDefinitions[capitalId]!.isCapital).toBe(true);
    }
  });
});
