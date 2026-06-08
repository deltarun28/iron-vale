/**
 * territories.ts — Static territory definitions for the Iron Vale map.
 *
 * A territory is a named group of tiles. When a single player controls all
 * tiles in a territory they earn a flat troops-per-second bonus applied to
 * every tile they own. Territories intentionally exclude towns so the bonus
 * rewards map control rather than just holding spawns.
 *
 * Bonus formula: bonusPerTile × tileCount = troops/s added to every owned tile.
 *   Mountain Pass (2 tiles) → +0.2/s on all owned tiles
 *   Each Forest     (2 tiles) → +0.2/s on all owned tiles
 *   Each Plains     (4 tiles) → +0.4/s on all owned tiles
 */

import { isPlayer } from "./state";
import type { PlayerId, TileState } from "./types";

export interface TerritoryDefinition {
  id: string;
  name: string;
  tileIds: readonly string[];
  bonusPerTile: number;
}

export const IRON_VALE_TERRITORIES: readonly TerritoryDefinition[] = [
  {
    id: "mountain_pass",
    name: "Mountain Pass",
    tileIds: ["north_pass_west", "north_pass_east"],
    bonusPerTile: 0.1,
  },
  {
    id: "west_forest",
    name: "West Forest",
    tileIds: ["west_coast_forest", "south_forest_west"],
    bonusPerTile: 0.1,
  },
  {
    id: "east_forest",
    name: "East Forest",
    tileIds: ["south_forest_east", "east_coast_forest"],
    bonusPerTile: 0.1,
  },
  {
    id: "west_vale",
    name: "West Vale",
    tileIds: ["west_coast_plains", "west_inner_plains", "west_top_plains", "west_plains"],
    bonusPerTile: 0.1,
  },
  {
    id: "east_vale",
    name: "East Vale",
    tileIds: ["east_coast_plains", "east_inner_plains", "east_top_plains", "east_plains"],
    bonusPerTile: 0.1,
  },
] as const;

/** Returns the player controlling all tiles, or null if split/neutral. */
export function getTerritoryController(
  territory: TerritoryDefinition,
  tiles: Record<string, TileState>
): PlayerId | null {
  let controller: PlayerId | null = null;
  for (const tileId of territory.tileIds) {
    const tile = tiles[tileId];
    if (!tile || !isPlayer(tile.owner)) return null;
    if (controller === null) {
      controller = tile.owner;
    } else if (tile.owner !== controller) {
      return null;
    }
  }
  return controller;
}

/** Total troops/s bonus granted when this territory is fully controlled. */
export function getTerritoryBonus(territory: TerritoryDefinition): number {
  return territory.tileIds.length * territory.bonusPerTile;
}
