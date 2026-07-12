/**
 * maps.ts — The single registry of per-map configuration.
 *
 * Everything that varies by map lives in one MapConfig entry: tile
 * definitions, sea lanes, spawn pool, territories, and the canvas layout
 * numbers that centre and fit each grid. Adding a map means adding one entry
 * here (plus its image config in canvasRenderer.ts, which stays separate
 * because HTMLImageElement doesn't exist in the headless simulator).
 */

import {
  BORDERLANDS_STARTING_TILES,
  borderlandsSeaLanes,
  getBorderlandsTileDefinitions,
} from "./borderlandsMap";
import {
  IRON_VALE_STARTING_TILES,
  getIronValeTileDefinitions,
  ironValeSeaLanes,
  type StartingTileSpec,
} from "./ironValeMap";
import {
  SHATTERED_ISLES_STARTING_TILES,
  getShatteredIslesTileDefinitions,
  shatteredIslesSeaLanes,
} from "./shatteredIslesMap";
import {
  BORDERLANDS_TERRITORIES,
  IRON_VALE_TERRITORIES,
  SHATTERED_ISLES_TERRITORIES,
  type TerritoryDefinition,
} from "./territories";
import type { MapId, SeaLane, TileDefinition } from "./types";

export type { StartingTileSpec };

export interface MapConfig {
  /** Fresh tile definitions from the map source (call per game / per load). */
  getTileDefinitions: () => Record<string, TileDefinition>;
  seaLanes: SeaLane[];
  startingTiles: readonly StartingTileSpec[];
  territories: readonly TerritoryDefinition[];
  /** Canvas-fit divisors: fitted tile size = min(width / fitDivX, height / fitDivY). */
  fitDivX: number;
  fitDivY: number;
  /** Origin offset from canvas centre, as multiples of tile size (centres asymmetric grids). */
  originXMul: number;
  originYMul: number;
}

export const MAP_CONFIGS: Record<MapId, MapConfig> = {
  // Iron Vale: q spans -4..+2, r spans -1..+1 (wide and short); needs a
  // rightward/upward nudge to centre on its asymmetric grid.
  river_crown: {
    getTileDefinitions: getIronValeTileDefinitions,
    seaLanes: ironValeSeaLanes,
    startingTiles: IRON_VALE_STARTING_TILES,
    territories: IRON_VALE_TERRITORIES,
    fitDivX: 13,
    fitDivY: 6,
    originXMul: 1.73,
    originYMul: -0.2,
  },
  // Borderlands: q spans -3..+2, r spans -3..+3 (7-row diamond); pixel centre
  // of the tile extent is 0.866 × size right of q=0,r=0.
  borderlands: {
    getTileDefinitions: getBorderlandsTileDefinitions,
    seaLanes: borderlandsSeaLanes,
    startingTiles: BORDERLANDS_STARTING_TILES,
    territories: BORDERLANDS_TERRITORIES,
    fitDivX: 11,
    fitDivY: 11,
    originXMul: 0.87,
    originYMul: 0,
  },
  // Shattered Isles: 8 tiles wide × 7 high (53-cell grid, 23 land tiles),
  // symmetric about the origin, so no origin nudge is needed.
  shattered_isles: {
    getTileDefinitions: getShatteredIslesTileDefinitions,
    seaLanes: shatteredIslesSeaLanes,
    startingTiles: SHATTERED_ISLES_STARTING_TILES,
    territories: SHATTERED_ISLES_TERRITORIES,
    fitDivX: 14,
    fitDivY: 11,
    originXMul: 0,
    originYMul: 0,
  },
};

export function getMapConfig(mapId: MapId): MapConfig {
  return MAP_CONFIGS[mapId];
}
