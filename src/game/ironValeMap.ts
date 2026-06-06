/**
 * ironValeMap.ts — Static map data for the 19-tile Iron Vale small map.
 *
 * ironValeTiles is the authoritative source for every hex's terrain, name,
 * adjacency list, axial coordinate, and starting state. Nothing here changes
 * at runtime — it is read once at game init and again on save load.
 *
 * The map follows a river-valley layout: mountains form a narrow northern pass,
 * forests flank a central bridge, and coastal towns anchor the south. Towns are
 * the only valid starting positions; the chosen tile is promoted to a capital
 * at game init so every player begins with one capital.
 *
 * getIronValeTileDefinitions() converts the array to a Record<id, def> for
 * O(1) lookup during gameplay. validateIronValeMap() checks adjacency
 * symmetry and sea-lane validity at startup.
 */

import type { SeaLane, TileDefinition } from "./types";

export const IRON_VALE_MAP_ID = "iron_vale_small_1v1";

export const IRON_VALE_MAP_NAME = "Iron Vale - 19 Tile Small 1v1 Map";

// The 19 tile definitions for the Iron Vale map.
// This array is the internal source of truth for map data - use
// getIronValeTileDefinitions() to get a Record keyed by id for game use.
//
// Layout (axial coords, pointy-top hexes):
//
//   q: -4          -3         -2         -1         0          1          2
// r:-1             west_cap   wt_plains  np_west    np_east    et_plains  east_cap
// r: 0  wc_plains  wi_plains  w_plains   cr_bridge  e_plains   ei_plains  ec_plains
// r: 1  wct        wcf        sf_west    sf_east    ecf        ect
//
// west_coast_plains is at q:-4,r:0 and east_coast_plains is at q:2,r:0
const ironValeTiles: TileDefinition[] = [
  {
    id: "west_town",
    name: "West Town",
    terrain: "plains",
    startingOwner: "neutral",
    startingTroops: 10,
    isCapital: false,
    isTown: true,
    coastal: false,
    adjacent: ["west_top_plains", "west_inner_plains", "west_coast_plains"],
    coord: { q: -3, r: -1 },
  },
  {
    id: "west_top_plains",
    name: "West Top Plains",
    terrain: "plains",
    startingOwner: "neutral",
    startingTroops: 4,
    isCapital: false,
    isTown: false,
    coastal: false,
    adjacent: ["west_town", "north_pass_west", "west_plains", "west_inner_plains"],
    coord: { q: -2, r: -1 },
  },
  {
    id: "north_pass_west",
    name: "North Pass West",
    terrain: "mountain",
    startingOwner: "neutral",
    startingTroops: 2,
    isCapital: false,
    isTown: false,
    coastal: false,
    adjacent: ["west_top_plains", "north_pass_east"],
    coord: { q: -1, r: -1 },
  },
  {
    id: "north_pass_east",
    name: "North Pass East",
    terrain: "mountain",
    startingOwner: "neutral",
    startingTroops: 2,
    isCapital: false,
    isTown: false,
    coastal: false,
    adjacent: ["north_pass_west", "east_top_plains"],
    coord: { q: 0, r: -1 },
  },
  {
    id: "east_top_plains",
    name: "East Top Plains",
    terrain: "plains",
    startingOwner: "neutral",
    startingTroops: 4,
    isCapital: false,
    isTown: false,
    coastal: false,
    adjacent: ["north_pass_east", "east_town", "east_plains", "east_inner_plains"],
    coord: { q: 1, r: -1 },
  },
  {
    id: "east_town",
    name: "East Town",
    terrain: "plains",
    startingOwner: "neutral",
    startingTroops: 10,
    isCapital: false,
    isTown: true,
    coastal: false,
    adjacent: ["east_top_plains", "east_inner_plains", "east_coast_plains"],
    coord: { q: 2, r: -1 },
  },
  {
    id: "west_inner_plains",
    name: "West Inner Plains",
    terrain: "plains",
    startingOwner: "neutral",
    startingTroops: 4,
    isCapital: false,
    isTown: false,
    coastal: false,
    adjacent: ["west_town", "west_top_plains", "west_plains", "west_coast_forest", "west_coast_town", "west_coast_plains"],
    coord: { q: -3, r: 0 },
  },
  {
    id: "west_plains",
    name: "West Plains",
    terrain: "plains",
    startingOwner: "neutral",
    startingTroops: 5,
    isCapital: false,
    isTown: false,
    coastal: false,
    adjacent: ["west_inner_plains", "west_top_plains", "iron_bridge", "south_forest_west", "west_coast_forest"],
    coord: { q: -2, r: 0 },
  },
  {
    id: "iron_bridge",
    name: "Iron Bridge",
    terrain: "plains",
    startingOwner: "neutral",
    startingTroops: 4,
    isCapital: false,
    isTown: false,
    coastal: false,
    hasBridge: true,
    adjacent: ["west_plains", "east_plains", "south_forest_west", "south_forest_east"],
    coord: { q: -1, r: 0 },
  },
  {
    id: "east_plains",
    name: "East Plains",
    terrain: "plains",
    startingOwner: "neutral",
    startingTroops: 5,
    isCapital: false,
    isTown: false,
    coastal: false,
    adjacent: ["east_inner_plains", "east_top_plains", "iron_bridge", "south_forest_east", "east_coast_forest"],
    coord: { q: 0, r: 0 },
  },
  {
    id: "east_inner_plains",
    name: "East Inner Plains",
    terrain: "plains",
    startingOwner: "neutral",
    startingTroops: 4,
    isCapital: false,
    isTown: false,
    coastal: false,
    adjacent: ["east_town", "east_top_plains", "east_plains", "east_coast_forest", "east_coast_town", "east_coast_plains"],
    coord: { q: 1, r: 0 },
  },
  {
    id: "west_coast_plains",
    name: "West Coast Plains",
    terrain: "plains",
    startingOwner: "neutral",
    startingTroops: 4,
    isCapital: false,
    isTown: false,
    coastal: false,
    adjacent: ["west_town", "west_inner_plains", "west_coast_town"],
    coord: { q: -4, r: 0 },
  },
  {
    id: "east_coast_plains",
    name: "East Coast Plains",
    terrain: "plains",
    startingOwner: "neutral",
    startingTroops: 4,
    isCapital: false,
    isTown: false,
    coastal: false,
    adjacent: ["east_town", "east_inner_plains", "east_coast_town"],
    coord: { q: 2, r: 0 },
  },
  {
    id: "west_coast_town",
    name: "West Coast Town",
    terrain: "plains",
    startingOwner: "neutral",
    startingTroops: 10,
    isCapital: false,
    isTown: true,
    coastal: true,
    adjacent: ["west_coast_forest", "west_inner_plains", "west_coast_plains"],
    coord: { q: -4, r: 1 },
  },
  {
    id: "west_coast_forest",
    name: "West Coast Forest",
    terrain: "forest",
    startingOwner: "neutral",
    startingTroops: 2,
    isCapital: false,
    isTown: false,
    coastal: false,
    adjacent: ["west_coast_town", "west_inner_plains", "west_plains", "south_forest_west"],
    coord: { q: -3, r: 1 },
  },
  {
    id: "south_forest_west",
    name: "South Forest West",
    terrain: "forest",
    startingOwner: "neutral",
    startingTroops: 2,
    isCapital: false,
    isTown: false,
    coastal: false,
    adjacent: ["west_coast_forest", "west_plains", "iron_bridge"],
    coord: { q: -2, r: 1 },
  },
  {
    id: "south_forest_east",
    name: "South Forest East",
    terrain: "forest",
    startingOwner: "neutral",
    startingTroops: 2,
    isCapital: false,
    isTown: false,
    coastal: false,
    adjacent: ["iron_bridge", "east_plains", "east_coast_forest"],
    coord: { q: -1, r: 1 },
  },
  {
    id: "east_coast_forest",
    name: "East Coast Forest",
    terrain: "forest",
    startingOwner: "neutral",
    startingTroops: 2,
    isCapital: false,
    isTown: false,
    coastal: false,
    adjacent: ["south_forest_east", "east_plains", "east_inner_plains", "east_coast_town"],
    coord: { q: 0, r: 1 },
  },
  {
    id: "east_coast_town",
    name: "East Coast Town",
    terrain: "plains",
    startingOwner: "neutral",
    startingTroops: 10,
    isCapital: false,
    isTown: true,
    coastal: true,
    adjacent: ["east_coast_forest", "east_inner_plains", "east_coast_plains"],
    coord: { q: 1, r: 1 },
  },
];

// Tiles that can be assigned as a player's starting position. All four are
// towns on the map; whichever one is picked becomes that player's capital at
// game init (see createInitialGameState). Inland positions carry a higher
// pickWeight so they're chosen more often than the coastal towns. This list
// also caps the maximum team count for a single match (currently 4).
export interface StartingTileSpec {
  id: string;
  pickWeight: number;
}

export const IRON_VALE_STARTING_TILES: readonly StartingTileSpec[] = [
  { id: "west_town", pickWeight: 2 },
  { id: "east_town", pickWeight: 2 },
  { id: "west_coast_town", pickWeight: 1 },
  { id: "east_coast_town", pickWeight: 1 },
] as const;

// The one sea lane in the MVP - connects the two coastal towns.
export const ironValeSeaLanes: SeaLane[] = [
  {
    id: "south_sea_lane",
    from: "west_coast_town",
    to: "east_coast_town",
    distance: 5,
    bidirectional: true,
  },
];

// Converts the tile array into a Record<id, TileDefinition> for fast lookup during gameplay.
export function getIronValeTileDefinitions(): Record<string, TileDefinition> {
  return Object.fromEntries(ironValeTiles.map((tile) => [tile.id, tile]));
}

// Validates the map data at startup. Returns an array of error strings.
// An empty array means the map is consistent.
export function validateIronValeMap(): string[] {
  const errors: string[] = [];
  const tileIds = new Set(ironValeTiles.map((tile) => tile.id));

  for (const tile of ironValeTiles) {
    if (tile.adjacent.includes(tile.id)) {
      errors.push(`${tile.id} cannot be adjacent to itself.`);
    }

    for (const adjacentId of tile.adjacent) {
      if (!tileIds.has(adjacentId)) {
        errors.push(`${tile.id} has unknown adjacent tile: ${adjacentId}`);
        continue;
      }

      // Adjacency must be symmetric: if A lists B, then B must also list A.
      const adjacentTile = ironValeTiles.find((candidate) => candidate.id === adjacentId);

      if (!adjacentTile?.adjacent.includes(tile.id)) {
        errors.push(`${tile.id} lists ${adjacentId}, but the reverse adjacency is missing.`);
      }
    }
  }

  for (const lane of ironValeSeaLanes) {
    if (!tileIds.has(lane.from)) {
      errors.push(`Sea lane ${lane.id} has unknown from tile: ${lane.from}`);
    }

    if (!tileIds.has(lane.to)) {
      errors.push(`Sea lane ${lane.id} has unknown to tile: ${lane.to}`);
    }

    const fromTile = ironValeTiles.find((tile) => tile.id === lane.from);
    const toTile = ironValeTiles.find((tile) => tile.id === lane.to);

    if (fromTile && !fromTile.coastal) {
      errors.push(`Sea lane ${lane.id} starts from non-coastal tile: ${lane.from}`);
    }

    if (toTile && !toTile.coastal) {
      errors.push(`Sea lane ${lane.id} ends at non-coastal tile: ${lane.to}`);
    }

    if (lane.distance <= 0) {
      errors.push(`Sea lane ${lane.id} must have a positive distance.`);
    }
  }

  return errors;
}
