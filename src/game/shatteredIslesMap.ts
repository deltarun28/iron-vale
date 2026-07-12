/**
 * shatteredIslesMap.ts — 23-tile Shattered Isles map definition.
 *
 * A sea-dominated map on an 8×7 hex grid (53 cells; the rest is open water):
 * four 4-tile town islands ring a 7-tile centre island with no town. All
 * movement between islands is by sea lane — there is no land bridge anywhere.
 * Each outer island has three routes (town → centre, plus two ring routes on
 * its forest and outer field); the centre has four, one per field landing.
 *
 * Layout (axial coords, pointy-top hexes, matching public/shattered.png):
 *
 *   r=-3      (-1,-3)NW_TOWN (0,-3)nw_forest    (3,-3)ne_forest (4,-3)NE_TOWN
 *   r=-2   (-2,-2)nw_field_w (-1,-2)nw_field_e     (3,-2)ne_field (4,-2)ne_heath
 *   r=-1                  (0,-1)landing_nw (1,-1)landing_ne
 *   r= 0             (-1,0)heart_forest_w (0,0)HEART_PEAK (1,0)heart_forest_e
 *   r= 1                  (-1,1)landing_sw (0,1)landing_se
 *   r= 2   (-4,2)sw_heath (-3,2)sw_field           (1,2)se_field (2,2)se_heath
 *   r= 3      (-4,3)SW_TOWN (-3,3)sw_forest    (0,3)se_forest (1,3)SE_TOWN
 *
 * Every tile is coastal. Each island's inner field (its plains tile nearest
 * the centre) is the port for the centre route; forests and outer tiles host
 * the ring lanes, and towns have no lanes at all — they are the protected
 * heart of each island, one land step from every port. The centre's peak and
 * heart forests are likewise lane-free: land assault only.
 */

import type { MapId, SeaLane, TileDefinition } from "./types";
import type { StartingTileSpec } from "./ironValeMap";

export const SHATTERED_ISLES_MAP_ID: MapId = "shattered_isles";
export const SHATTERED_ISLES_MAP_NAME = "Shattered Isles";

export const SHATTERED_ISLES_STARTING_TILES: readonly StartingTileSpec[] = [
  { id: "si_nw_town", pickWeight: 1 },
  { id: "si_ne_town", pickWeight: 1 },
  { id: "si_sw_town", pickWeight: 1 },
  { id: "si_se_town", pickWeight: 1 },
];

const shatteredIslesTiles: TileDefinition[] = [
  // ── Northwest island (town, forest, two fields) ────────────────────────────
  {
    id: "si_nw_town", name: "Northwest Haven",
    terrain: "plains", startingOwner: "neutral", startingTroops: 5,
    isCapital: false, isTown: true, coastal: true,
    coord: { q: -1, r: -3 },
    adjacent: ["si_nw_forest", "si_nw_field_w", "si_nw_field_e"],
  },
  {
    id: "si_nw_forest", name: "Northwest Forest",
    terrain: "forest", startingOwner: "neutral", startingTroops: 3,
    isCapital: false, isTown: false, coastal: true,
    coord: { q: 0, r: -3 },
    adjacent: ["si_nw_town", "si_nw_field_e"],
  },
  {
    id: "si_nw_field_w", name: "Northwest Fields",
    terrain: "plains", startingOwner: "neutral", startingTroops: 3,
    isCapital: false, isTown: false, coastal: true,
    coord: { q: -2, r: -2 },
    adjacent: ["si_nw_town", "si_nw_field_e"],
  },
  {
    id: "si_nw_field_e", name: "Northwest Meadow",
    terrain: "plains", startingOwner: "neutral", startingTroops: 3,
    isCapital: false, isTown: false, coastal: true,
    coord: { q: -1, r: -2 },
    adjacent: ["si_nw_town", "si_nw_forest", "si_nw_field_w"],
  },

  // ── Northeast island ───────────────────────────────────────────────────────
  {
    id: "si_ne_town", name: "Northeast Haven",
    terrain: "plains", startingOwner: "neutral", startingTroops: 5,
    isCapital: false, isTown: true, coastal: true,
    coord: { q: 4, r: -3 },
    adjacent: ["si_ne_forest", "si_ne_field", "si_ne_heath"],
  },
  {
    id: "si_ne_forest", name: "Northeast Forest",
    terrain: "forest", startingOwner: "neutral", startingTroops: 3,
    isCapital: false, isTown: false, coastal: true,
    coord: { q: 3, r: -3 },
    adjacent: ["si_ne_town", "si_ne_field"],
  },
  {
    id: "si_ne_field", name: "Northeast Fields",
    terrain: "plains", startingOwner: "neutral", startingTroops: 3,
    isCapital: false, isTown: false, coastal: true,
    coord: { q: 3, r: -2 },
    adjacent: ["si_ne_town", "si_ne_forest", "si_ne_heath"],
  },
  {
    id: "si_ne_heath", name: "Northeast Heath",
    terrain: "plains", startingOwner: "neutral", startingTroops: 3,
    isCapital: false, isTown: false, coastal: true,
    coord: { q: 4, r: -2 },
    adjacent: ["si_ne_town", "si_ne_field"],
  },

  // ── Southwest island ───────────────────────────────────────────────────────
  {
    id: "si_sw_town", name: "Southwest Haven",
    terrain: "plains", startingOwner: "neutral", startingTroops: 5,
    isCapital: false, isTown: true, coastal: true,
    coord: { q: -4, r: 3 },
    adjacent: ["si_sw_forest", "si_sw_field", "si_sw_heath"],
  },
  {
    id: "si_sw_forest", name: "Southwest Forest",
    terrain: "forest", startingOwner: "neutral", startingTroops: 3,
    isCapital: false, isTown: false, coastal: true,
    coord: { q: -3, r: 3 },
    adjacent: ["si_sw_town", "si_sw_field"],
  },
  {
    id: "si_sw_field", name: "Southwest Fields",
    terrain: "plains", startingOwner: "neutral", startingTroops: 3,
    isCapital: false, isTown: false, coastal: true,
    coord: { q: -3, r: 2 },
    adjacent: ["si_sw_town", "si_sw_forest", "si_sw_heath"],
  },
  {
    id: "si_sw_heath", name: "Southwest Heath",
    terrain: "plains", startingOwner: "neutral", startingTroops: 3,
    isCapital: false, isTown: false, coastal: true,
    coord: { q: -4, r: 2 },
    adjacent: ["si_sw_town", "si_sw_field"],
  },

  // ── Southeast island ───────────────────────────────────────────────────────
  {
    id: "si_se_town", name: "Southeast Haven",
    terrain: "plains", startingOwner: "neutral", startingTroops: 5,
    isCapital: false, isTown: true, coastal: true,
    coord: { q: 1, r: 3 },
    adjacent: ["si_se_forest", "si_se_field", "si_se_heath"],
  },
  {
    id: "si_se_forest", name: "Southeast Forest",
    terrain: "forest", startingOwner: "neutral", startingTroops: 3,
    isCapital: false, isTown: false, coastal: true,
    coord: { q: 0, r: 3 },
    adjacent: ["si_se_town", "si_se_field"],
  },
  {
    id: "si_se_field", name: "Southeast Fields",
    terrain: "plains", startingOwner: "neutral", startingTroops: 3,
    isCapital: false, isTown: false, coastal: true,
    coord: { q: 1, r: 2 },
    adjacent: ["si_se_town", "si_se_forest", "si_se_heath"],
  },
  {
    id: "si_se_heath", name: "Southeast Heath",
    terrain: "plains", startingOwner: "neutral", startingTroops: 3,
    isCapital: false, isTown: false, coastal: true,
    coord: { q: 2, r: 2 },
    adjacent: ["si_se_town", "si_se_field"],
  },

  // ── Centre island — no town, the contested prize ───────────────────────────
  // Four field landings host the lanes; the peak and its flanking forests can
  // only be taken by land after winning a beachhead.
  {
    id: "si_landing_nw", name: "Northwest Landing",
    terrain: "plains", startingOwner: "neutral", startingTroops: 4,
    isCapital: false, isTown: false, coastal: true,
    coord: { q: 0, r: -1 },
    adjacent: ["si_landing_ne", "si_heart_forest_w", "si_heart_peak"],
  },
  {
    id: "si_landing_ne", name: "Northeast Landing",
    terrain: "plains", startingOwner: "neutral", startingTroops: 4,
    isCapital: false, isTown: false, coastal: true,
    coord: { q: 1, r: -1 },
    adjacent: ["si_landing_nw", "si_heart_peak", "si_heart_forest_e"],
  },
  {
    id: "si_landing_sw", name: "Southwest Landing",
    terrain: "plains", startingOwner: "neutral", startingTroops: 4,
    isCapital: false, isTown: false, coastal: true,
    coord: { q: -1, r: 1 },
    adjacent: ["si_landing_se", "si_heart_forest_w", "si_heart_peak"],
  },
  {
    id: "si_landing_se", name: "Southeast Landing",
    terrain: "plains", startingOwner: "neutral", startingTroops: 4,
    isCapital: false, isTown: false, coastal: true,
    coord: { q: 0, r: 1 },
    adjacent: ["si_landing_sw", "si_heart_peak", "si_heart_forest_e"],
  },
  {
    id: "si_heart_forest_w", name: "Heartwood West",
    terrain: "forest", startingOwner: "neutral", startingTroops: 4,
    isCapital: false, isTown: false, coastal: true,
    coord: { q: -1, r: 0 },
    adjacent: ["si_landing_nw", "si_landing_sw", "si_heart_peak"],
  },
  {
    id: "si_heart_forest_e", name: "Heartwood East",
    terrain: "forest", startingOwner: "neutral", startingTroops: 4,
    isCapital: false, isTown: false, coastal: true,
    coord: { q: 1, r: 0 },
    adjacent: ["si_landing_ne", "si_landing_se", "si_heart_peak"],
  },
  {
    id: "si_heart_peak", name: "The Shattered Peak",
    terrain: "mountain", startingOwner: "neutral", startingTroops: 3,
    isCapital: false, isTown: false, coastal: true,
    coord: { q: 0, r: 0 },
    adjacent: [
      "si_landing_nw", "si_landing_ne", "si_landing_sw", "si_landing_se",
      "si_heart_forest_w", "si_heart_forest_e",
    ],
  },
];

// Eight lanes: each island's centre route runs from its plains tile nearest
// the centre island (the inner field) to the matching landing; the ring
// routes connect neighbouring islands via their forests and outer tiles.
export const shatteredIslesSeaLanes: SeaLane[] = [
  // Inner field ↔ centre (short crossings)
  { id: "si_lane_nw_center", from: "si_nw_field_e", to: "si_landing_nw", distance: 2, bidirectional: true },
  { id: "si_lane_ne_center", from: "si_ne_field",   to: "si_landing_ne", distance: 2, bidirectional: true },
  { id: "si_lane_sw_center", from: "si_sw_field",   to: "si_landing_sw", distance: 2, bidirectional: true },
  { id: "si_lane_se_center", from: "si_se_field",   to: "si_landing_se", distance: 2, bidirectional: true },
  // Ring (longer crossings between adjacent islands)
  { id: "si_lane_north", from: "si_nw_forest", to: "si_ne_forest", distance: 3, bidirectional: true },
  { id: "si_lane_south", from: "si_sw_forest", to: "si_se_forest", distance: 3, bidirectional: true },
  { id: "si_lane_west",  from: "si_nw_field_w", to: "si_sw_heath", distance: 3, bidirectional: true },
  { id: "si_lane_east",  from: "si_ne_heath",  to: "si_se_heath", distance: 3, bidirectional: true },
];

export function getShatteredIslesTileDefinitions(): Record<string, TileDefinition> {
  return Object.fromEntries(shatteredIslesTiles.map((tile) => [tile.id, tile]));
}
