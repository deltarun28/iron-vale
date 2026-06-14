/**
 * borderlandsMap.ts — 30-tile Borderlands map definition.
 *
 * Layout (axial coords, pointy-top hexes, 7 rows):
 *
 *         (0,-3) (1,-3) (2,-3)
 *      (-1,-2)(0,-2)(1,-2)(2,-2)
 *    (-2,-1)(-1,-1)(0,-1)(1,-1)(2,-1)
 *  (-3,0)(-2,0)(-1,0)(0,0)(1,0)(2,0)
 *    (-3,1)(-2,1)(-1,1)(0,1)(1,1)
 *      (-3,2)(-2,2)(-1,2)(0,2)
 *         (-3,3)(-2,3)(-1,3)
 *
 * Capitals: bl_cap_north(1,-3), bl_cap_west(-3,0),
 *           bl_cap_east(2,0), bl_cap_south(-2,3)
 */

import type { MapId, TileDefinition } from "./types";
import type { StartingTileSpec } from "./ironValeMap";

export const BORDERLANDS_MAP_ID: MapId = "borderlands";
export const BORDERLANDS_MAP_NAME = "Borderlands";

export const BORDERLANDS_STARTING_TILES: readonly StartingTileSpec[] = [
  { id: "bl_cap_north", pickWeight: 1 },
  { id: "bl_cap_west",  pickWeight: 1 },
  { id: "bl_cap_east",  pickWeight: 1 },
  { id: "bl_cap_south", pickWeight: 1 },
];

export const borderlandsSeaLanes: import("./types").SeaLane[] = [];

export function getBorderlandsTileDefinitions(): Record<string, TileDefinition> {
  const defs: TileDefinition[] = [
    // ── Row r = -3 (3 tiles) ────────────────────────────────────────────────
    {
      id: "bl_north_forest_w", name: "North Forest West",
      terrain: "forest", startingOwner: "neutral", startingTroops: 3,
      isCapital: false, isTown: false, coastal: false,
      coord: { q: 0, r: -3 },
      adjacent: ["bl_cap_north", "bl_north_pass_w", "bl_nw_forest"],
    },
    {
      id: "bl_cap_north", name: "North Capital",
      terrain: "plains", startingOwner: "neutral", startingTroops: 5,
      isCapital: false, isTown: true, coastal: false,
      coord: { q: 1, r: -3 },
      adjacent: ["bl_north_forest_e", "bl_north_forest_w", "bl_north_pass_e", "bl_north_pass_w"],
    },
    {
      id: "bl_north_forest_e", name: "North Forest East",
      terrain: "forest", startingOwner: "neutral", startingTroops: 3,
      isCapital: false, isTown: false, coastal: false,
      coord: { q: 2, r: -3 },
      adjacent: ["bl_cap_north", "bl_ne_forest", "bl_north_pass_e"],
    },

    // ── Row r = -2 (4 tiles) ────────────────────────────────────────────────
    {
      id: "bl_nw_forest", name: "Northwest Forest",
      terrain: "forest", startingOwner: "neutral", startingTroops: 3,
      isCapital: false, isTown: false, coastal: false,
      coord: { q: -1, r: -2 },
      adjacent: ["bl_north_pass_w", "bl_north_vale_w", "bl_north_forest_w", "bl_west_pass_n"],
    },
    {
      id: "bl_north_pass_w", name: "North Pass West",
      terrain: "mountain", startingOwner: "neutral", startingTroops: 2,
      isCapital: false, isTown: false, coastal: false,
      coord: { q: 0, r: -2 },
      adjacent: ["bl_north_pass_e", "bl_nw_forest", "bl_north_forest_c", "bl_north_forest_w", "bl_cap_north", "bl_north_vale_w"],
    },
    {
      id: "bl_north_pass_e", name: "North Pass East",
      terrain: "mountain", startingOwner: "neutral", startingTroops: 2,
      isCapital: false, isTown: false, coastal: false,
      coord: { q: 1, r: -2 },
      adjacent: ["bl_ne_forest", "bl_north_pass_w", "bl_north_vale_e", "bl_cap_north", "bl_north_forest_e", "bl_north_forest_c"],
    },
    {
      id: "bl_ne_forest", name: "Northeast Forest",
      terrain: "forest", startingOwner: "neutral", startingTroops: 3,
      isCapital: false, isTown: false, coastal: false,
      coord: { q: 2, r: -2 },
      adjacent: ["bl_north_pass_e", "bl_east_pass_n", "bl_north_forest_e", "bl_north_vale_e"],
    },

    // ── Row r = -1 (5 tiles) ────────────────────────────────────────────────
    {
      id: "bl_west_pass_n", name: "West Pass North",
      terrain: "mountain", startingOwner: "neutral", startingTroops: 2,
      isCapital: false, isTown: false, coastal: false,
      coord: { q: -2, r: -1 },
      adjacent: ["bl_north_vale_w", "bl_west_forest", "bl_nw_forest", "bl_cap_west"],
    },
    {
      id: "bl_north_vale_w", name: "North Vale West",
      terrain: "plains", startingOwner: "neutral", startingTroops: 3,
      isCapital: false, isTown: false, coastal: false,
      coord: { q: -1, r: -1 },
      adjacent: ["bl_north_forest_c", "bl_west_pass_n", "bl_center_vale_w", "bl_nw_forest", "bl_north_pass_w", "bl_west_forest"],
    },
    {
      id: "bl_north_forest_c", name: "North Forest Center",
      terrain: "forest", startingOwner: "neutral", startingTroops: 3,
      isCapital: false, isTown: false, coastal: false,
      coord: { q: 0, r: -1 },
      adjacent: ["bl_north_vale_e", "bl_north_vale_w", "bl_center_vale_e", "bl_north_pass_w", "bl_north_pass_e", "bl_center_vale_w"],
    },
    {
      id: "bl_north_vale_e", name: "North Vale East",
      terrain: "plains", startingOwner: "neutral", startingTroops: 3,
      isCapital: false, isTown: false, coastal: false,
      coord: { q: 1, r: -1 },
      adjacent: ["bl_east_pass_n", "bl_north_forest_c", "bl_east_forest", "bl_north_pass_e", "bl_ne_forest", "bl_center_vale_e"],
    },
    {
      id: "bl_east_pass_n", name: "East Pass North",
      terrain: "mountain", startingOwner: "neutral", startingTroops: 2,
      isCapital: false, isTown: false, coastal: false,
      coord: { q: 2, r: -1 },
      adjacent: ["bl_north_vale_e", "bl_cap_east", "bl_ne_forest", "bl_east_forest"],
    },

    // ── Row r = 0 (6 tiles) ─────────────────────────────────────────────────
    {
      id: "bl_cap_west", name: "West Capital",
      terrain: "plains", startingOwner: "neutral", startingTroops: 5,
      isCapital: false, isTown: true, coastal: false,
      coord: { q: -3, r: 0 },
      adjacent: ["bl_west_forest", "bl_west_pass_s", "bl_west_pass_n"],
    },
    {
      id: "bl_west_forest", name: "West Forest",
      terrain: "forest", startingOwner: "neutral", startingTroops: 3,
      isCapital: false, isTown: false, coastal: false,
      coord: { q: -2, r: 0 },
      adjacent: ["bl_center_vale_w", "bl_cap_west", "bl_south_vale_w", "bl_west_pass_n", "bl_north_vale_w", "bl_west_pass_s"],
    },
    {
      id: "bl_center_vale_w", name: "Center Vale West",
      terrain: "plains", startingOwner: "neutral", startingTroops: 3,
      isCapital: false, isTown: false, coastal: false,
      coord: { q: -1, r: 0 },
      adjacent: ["bl_center_vale_e", "bl_west_forest", "bl_center_forest", "bl_north_vale_w", "bl_north_forest_c", "bl_south_vale_w"],
    },
    {
      id: "bl_center_vale_e", name: "Center Vale East",
      terrain: "plains", startingOwner: "neutral", startingTroops: 3,
      isCapital: false, isTown: false, coastal: false,
      coord: { q: 0, r: 0 },
      adjacent: ["bl_east_forest", "bl_center_vale_w", "bl_south_vale_e", "bl_north_forest_c", "bl_north_vale_e", "bl_center_forest"],
    },
    {
      id: "bl_east_forest", name: "East Forest",
      terrain: "forest", startingOwner: "neutral", startingTroops: 3,
      isCapital: false, isTown: false, coastal: false,
      coord: { q: 1, r: 0 },
      adjacent: ["bl_cap_east", "bl_center_vale_e", "bl_east_pass_s", "bl_north_vale_e", "bl_east_pass_n", "bl_south_vale_e"],
    },
    {
      id: "bl_cap_east", name: "East Capital",
      terrain: "plains", startingOwner: "neutral", startingTroops: 5,
      isCapital: false, isTown: true, coastal: false,
      coord: { q: 2, r: 0 },
      adjacent: ["bl_east_forest", "bl_east_pass_n", "bl_east_pass_s"],
    },

    // ── Row r = 1 (5 tiles) ─────────────────────────────────────────────────
    {
      id: "bl_west_pass_s", name: "West Pass South",
      terrain: "mountain", startingOwner: "neutral", startingTroops: 2,
      isCapital: false, isTown: false, coastal: false,
      coord: { q: -3, r: 1 },
      adjacent: ["bl_south_vale_w", "bl_sw_forest", "bl_cap_west", "bl_west_forest"],
    },
    {
      id: "bl_south_vale_w", name: "South Vale West",
      terrain: "plains", startingOwner: "neutral", startingTroops: 3,
      isCapital: false, isTown: false, coastal: false,
      coord: { q: -2, r: 1 },
      adjacent: ["bl_center_forest", "bl_west_pass_s", "bl_south_pass_w", "bl_west_forest", "bl_center_vale_w", "bl_sw_forest"],
    },
    {
      id: "bl_center_forest", name: "Center Forest",
      terrain: "forest", startingOwner: "neutral", startingTroops: 3,
      isCapital: false, isTown: false, coastal: false,
      coord: { q: -1, r: 1 },
      adjacent: ["bl_south_vale_e", "bl_south_vale_w", "bl_south_pass_e", "bl_center_vale_w", "bl_center_vale_e", "bl_south_pass_w"],
    },
    {
      id: "bl_south_vale_e", name: "South Vale East",
      terrain: "plains", startingOwner: "neutral", startingTroops: 3,
      isCapital: false, isTown: false, coastal: false,
      coord: { q: 0, r: 1 },
      adjacent: ["bl_east_pass_s", "bl_center_forest", "bl_se_forest", "bl_center_vale_e", "bl_east_forest", "bl_south_pass_e"],
    },
    {
      id: "bl_east_pass_s", name: "East Pass South",
      terrain: "mountain", startingOwner: "neutral", startingTroops: 2,
      isCapital: false, isTown: false, coastal: false,
      coord: { q: 1, r: 1 },
      adjacent: ["bl_south_vale_e", "bl_east_forest", "bl_cap_east", "bl_se_forest"],
    },

    // ── Row r = 2 (4 tiles) ─────────────────────────────────────────────────
    {
      id: "bl_sw_forest", name: "Southwest Forest",
      terrain: "forest", startingOwner: "neutral", startingTroops: 3,
      isCapital: false, isTown: false, coastal: false,
      coord: { q: -3, r: 2 },
      adjacent: ["bl_south_pass_w", "bl_south_forest_w", "bl_west_pass_s", "bl_south_vale_w"],
    },
    {
      id: "bl_south_pass_w", name: "South Pass West",
      terrain: "mountain", startingOwner: "neutral", startingTroops: 2,
      isCapital: false, isTown: false, coastal: false,
      coord: { q: -2, r: 2 },
      adjacent: ["bl_south_pass_e", "bl_sw_forest", "bl_cap_south", "bl_south_vale_w", "bl_center_forest", "bl_south_forest_w"],
    },
    {
      id: "bl_south_pass_e", name: "South Pass East",
      terrain: "mountain", startingOwner: "neutral", startingTroops: 2,
      isCapital: false, isTown: false, coastal: false,
      coord: { q: -1, r: 2 },
      adjacent: ["bl_se_forest", "bl_south_pass_w", "bl_south_forest_e", "bl_center_forest", "bl_south_vale_e", "bl_cap_south"],
    },
    {
      id: "bl_se_forest", name: "Southeast Forest",
      terrain: "forest", startingOwner: "neutral", startingTroops: 3,
      isCapital: false, isTown: false, coastal: false,
      coord: { q: 0, r: 2 },
      adjacent: ["bl_south_pass_e", "bl_south_vale_e", "bl_east_pass_s", "bl_south_forest_e"],
    },

    // ── Row r = 3 (3 tiles) ─────────────────────────────────────────────────
    {
      id: "bl_south_forest_w", name: "South Forest West",
      terrain: "forest", startingOwner: "neutral", startingTroops: 3,
      isCapital: false, isTown: false, coastal: false,
      coord: { q: -3, r: 3 },
      adjacent: ["bl_cap_south", "bl_sw_forest", "bl_south_pass_w"],
    },
    {
      id: "bl_cap_south", name: "South Capital",
      terrain: "plains", startingOwner: "neutral", startingTroops: 5,
      isCapital: false, isTown: true, coastal: false,
      coord: { q: -2, r: 3 },
      adjacent: ["bl_south_forest_e", "bl_south_forest_w", "bl_south_pass_w", "bl_south_pass_e"],
    },
    {
      id: "bl_south_forest_e", name: "South Forest East",
      terrain: "forest", startingOwner: "neutral", startingTroops: 3,
      isCapital: false, isTown: false, coastal: false,
      coord: { q: -1, r: 3 },
      adjacent: ["bl_cap_south", "bl_south_pass_e", "bl_se_forest"],
    },
  ];

  return Object.fromEntries(defs.map((d) => [d.id, d]));
}

export function validateBorderlandsMap(): void {
  const defs = getBorderlandsTileDefinitions();
  const ids = new Set(Object.keys(defs));
  for (const [id, def] of Object.entries(defs)) {
    for (const nbr of def.adjacent) {
      if (!ids.has(nbr)) throw new Error(`${id} → unknown neighbour ${nbr}`);
      const reverse = defs[nbr]!.adjacent;
      if (!reverse.includes(id)) throw new Error(`${id}↔${nbr} not symmetric`);
    }
  }
}
