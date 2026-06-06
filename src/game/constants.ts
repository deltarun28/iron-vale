/**
 * constants.ts — All tunable game values in one place.
 *
 * Grouping related values into named objects (COMBAT, SEA, AI, etc.) keeps
 * them organised and makes it obvious which system a value belongs to.
 * All objects use `as const` so TypeScript infers the narrowest possible types
 * and prevents accidental mutation.
 *
 * Helper functions at the bottom (getTerrainDefenceMultiplier, etc.) are kept
 * here so callers never need to write their own switch statements for terrain
 * or difficulty logic.
 */

import type { Difficulty, TerrainType } from "./types";

// "as const" tells TypeScript to treat this object as read-only and to infer
// the narrowest possible types (e.g. "player1" instead of just string).
export const PLAYERS = {
  PLAYER_1: "player1",
  PLAYER_2: "player2",
  NEUTRAL: "neutral",
} as const;

export const STARTING_GOLD = 5;

// All starting tiles are towns on the map. The chosen tile is promoted to a
// capital at game init, so every player begins with one capital regardless of
// which spawn they drew. Pick weights are per-tile (see IRON_VALE_STARTING_TILES
// in ironValeMap.ts) so spawn bias can be tuned without touching this file.
export const STARTING_POSITIONS = {
  PLAYER_STARTING_TROOPS: 10,
} as const;

// Grouping related values into objects (like GOLD_CAP) keeps constants
// organised and makes it obvious which values belong together.
export const GOLD_CAP = {
  BASE: 10,
  PER_CAPITAL: 10,
} as const;

// Storing rates as troops-per-second rather than seconds-per-troop means
// we can simply multiply by deltaSeconds in the game loop: rate * dt = troops.
export const TROOP_PRODUCTION_PER_SECOND = {
  plains: 1 / 3,
  forest: 1 / 5,
  mountain: 1 / 7,
  capital: 1 / 3,
  neutralPlains: 1 / 10,
  neutralForest: 1 / 15,
  neutralMountain: 1 / 20,
} as const;

// Declaring an interface here (instead of inline) gives us a reusable type
// that documents what a production cap entry looks like.
export interface ProductionCap {
  normalUntil: number;  // full rate below this troop count
  slowsUntil: number;   // rate tapers linearly from normalUntil to slowsUntil
  stopsAt: number;      // rate reaches zero at this count
  decaysAbove: number;  // troops above this level slowly bleed back down
  decaysToward: number; // decay target (prevents infinite bleed)
}

// Record<K, V> is TypeScript shorthand for "an object whose keys are K and
// whose values are V". This guarantees every terrain type has an entry.
export const PRODUCTION_CAPS: Record<"plains" | "forest" | "mountain" | "capital", ProductionCap> = {
  plains: {
    normalUntil: 20,
    slowsUntil: 25,
    stopsAt: 25,
    decaysAbove: 30,
    decaysToward: 30,
  },
  forest: {
    normalUntil: 15,
    slowsUntil: 20,
    stopsAt: 20,
    decaysAbove: 25,
    decaysToward: 25,
  },
  mountain: {
    normalUntil: 10,
    slowsUntil: 15,
    stopsAt: 15,
    decaysAbove: 25,
    decaysToward: 25,
  },
  capital: {
    normalUntil: 20,
    slowsUntil: 25,
    stopsAt: 25,
    decaysAbove: 35,
    decaysToward: 35,
  },
} as const;

export const NEUTRAL_MAX_TROOPS = 20;

export const GOLD_PRODUCTION_PER_SECOND = {
  capital: 1 / 4,
  town: 1 / 6,
} as const;

export const GOLD_FREEZE_SECONDS = {
  town: 5,
  capital: 8,
} as const;

export const CAPITAL_RECLAIM_WINDOW_SECONDS = 10;

export const MOVEMENT = {
  LAND_REINFORCE_BASE_SECONDS: 1.0,
  LAND_ATTACK_BASE_SECONDS: 1.2,
  TROOP_LOAD_FREE_AMOUNT: 10,
  TROOP_LOAD_MULTIPLIER_PER_EXTRA_TROOP: 0.015,
} as const;

export const TERRAIN_MOVEMENT_MULTIPLIER: Record<TerrainType, number> = {
  plains: 1.0,
  forest: 1.8,
  mountain: 3.0,
} as const;

export const COMBAT = {
  INFANTRY_POWER: 1.0,
  DEFENDER_BIAS_BASE: 0.40,
  RANDOMNESS_BASE: 0.35,

  FOREST_DEFENCE_MULTIPLIER: 1.15,
  MOUNTAIN_DEFENCE_MULTIPLIER: 1.30,
  CAPITAL_DEFENCE_MULTIPLIER: 1.10,
  SEA_ATTACK_DEFENCE_MULTIPLIER: 1.20,

  RESOLUTION_BASE_SECONDS: 0.5,
  RESOLUTION_PER_SQRT_MIN_FORCE: 0.22,
} as const;

export const SEA = {
  COMBAT_TIME_MULTIPLIER: 1.6,

  TRAVEL_TIME_DISTANCE_MULTIPLIER: 0.6,
  TRAVEL_TIME_SQRT_DISTANCE_MULTIPLIER: 0.1,

  DISEMBARK_BASE_SECONDS: 0.4,
  DISEMBARK_LOG2_DISTANCE_MULTIPLIER: 0.15,

  BUSY_LOCK_ATTACKER_TO_DEFENDER_RATIO: 0.4,
  CAPITAL_CAPTURE_ATTACKER_TO_DEFENDER_RATIO: 0.5,

  COST_PER_EFFECTIVE_WEIGHT: 10,
  MAX_SEA_COST: 8,
  FREE_TOWN_TO_TOWN_MAX_EFFECTIVE_WEIGHT: 10,

  EMBARK_COOLDOWN_TOWN_OR_CAPITAL_SECONDS: 2,
  EMBARK_COOLDOWN_OTHER_COAST_SECONDS: 3,
} as const;

export const FORT = {
  MAX_LEVEL: 5,
  GOLD_COST_PER_LEVEL: 5,
  BUILD_SECONDS_PER_LEVEL: 4,
  DEFENCE_BONUS_PER_LEVEL: 0.06,       // +6% defence per level → 1.30× at max
  LAND_ATTACK_DELAY_PER_LEVEL: 0.10,   // 10% slower land attack per level
  SEA_ATTACK_DELAY_PER_LEVEL: 0.15,    // 15% slower sea attack per level
  CAPTURE_LEVEL_REDUCTION: 2,          // level drops by 2 on capture (min 0)
} as const;

export const ARMOUR = {
  GOLD_COST: 5,
  ATTACK_MULTIPLIER: 1.25,
  DEFENCE_MULTIPLIER: 1.25,
} as const;

// Veterans are earned through combat — not purchased.
// Attack vet: gained by winning an attack. Defence vet: gained by surviving a defence.
// Each level adds a flat bonus stacked multiplicatively with other modifiers.
export const VETERAN = {
  MAX_LEVEL: 3,
  ATTACK_BONUS_PER_LEVEL: 0.08,   // +8% attack power per level
  ATTACK_SPEED_BONUS_PER_LEVEL: 0.08, // 8% faster attack time per level
  DEFENCE_BONUS_PER_LEVEL: 0.12,  // +12% defence power per level
} as const;

export const AI = {
  // How long the AI must stay in a stance before it can switch again.
  // Shorter means it adapts faster to changing conditions.
  MIN_STANCE_DURATION_SECONDS: 5,

  // The AI only switches to defensive when badly outnumbered (< 65% of player troops).
  // 0.85 was too hair-trigger — the AI went defensive on any small disadvantage.
  POWER_RATIO_DEFENSIVE_THRESHOLD: 0.65,

  // Goes aggressive whenever troops are roughly equal or better.
  POWER_RATIO_AGGRESSIVE_THRESHOLD: 1.00,

  // Becomes aggressive after capturing about 5 of 13 tiles (~38%).
  TERRITORY_SHARE_AGGRESSIVE_THRESHOLD: 0.35,

  // The first N seconds force aggressive expansion before thresholds kick in.
  EARLY_GAME_AGGRESSIVE_SECONDS: 25,

  EASY_THINK_MIN_SECONDS: 1.5,
  EASY_THINK_MAX_SECONDS: 2.2,
  EASY_MAX_ACTIONS_PER_THINK: 1,

  NORMAL_THINK_MIN_SECONDS: 0.8,
  NORMAL_THINK_MAX_SECONDS: 1.3,
  NORMAL_MAX_ACTIONS_PER_THINK: 2,

  HARD_THINK_MIN_SECONDS: 0.35,
  HARD_THINK_MAX_SECONDS: 0.6,
  HARD_MAX_ACTIONS_PER_THINK: 3,

  EASY_RESERVE_MIN_FRACTION: 0.4,
  EASY_RESERVE_MAX_FRACTION: 0.5,

  NORMAL_RESERVE_MIN_FRACTION: 0.2,
  NORMAL_RESERVE_MAX_FRACTION: 0.3,

  EASY_SECOND_OR_THIRD_BEST_ACTION_CHANCE: 0.2,
  EASY_OVERVALUE_NEUTRALS_CHANCE: 0.1,
  EASY_DELAY_CAPITAL_DEFENCE_CHANCE: 0.1,

  // Minimum troops Normal/Hard need on a source tile before they'll attack.
  // Lower than Easy's hard-coded 7 so the smarter AIs can punish exposed
  // weakly-held tiles instead of always waiting for a big stack.
  MIN_TROOPS_TO_ATTACK_NORMAL: 5,

  // When sizing an attack, send enough to comfortably overwhelm:
  //   sent = ceil(defender * TARGET_MULTIPLIER) + CUSHION
  // and leave at least MIN_GARRISON_LEFT behind. Used by Normal/Hard.
  ATTACK_TARGET_MULTIPLIER: 1.4,
  ATTACK_CUSHION: 2,
  ATTACK_MIN_GARRISON_LEFT: 2,

  // An enemy tile counts as "under threat" of attack when its incoming enemy
  // troop mass reaches this fraction of the defender's effective garrison.
  THREAT_RATIO_FLOOR: 0.7,

  // Score bumps applied during candidate selection.
  BUSY_TARGET_BONUS: 35,          // attacking a busy enemy tile is near-free
  THREAT_REINFORCE_BONUS: 60,     // reinforcing a tile actively under threat
  CAPITAL_PATH_BONUS_BASE: 55,    // Hard: bonus for tiles on path to enemy capital
  CAPITAL_PATH_BONUS_FALLOFF: 12, // bonus decays by this much per BFS hop
  ENCIRCLE_BONUS: 30,             // Hard: bonus for tiles adjacent to enemy capital
} as const;

/**
 * Returns the raw defence multiplier for a terrain type.
 * Plains are baseline (1.0); forest and mountain give progressively stronger
 * defensive bonuses. Used in combat resolution and displayed in the tile panel.
 */
export function getTerrainDefenceMultiplier(terrain: TerrainType): number {
  switch (terrain) {
    case "plains":
      return 1.0;
    case "forest":
      return COMBAT.FOREST_DEFENCE_MULTIPLIER;
    case "mountain":
      return COMBAT.MOUNTAIN_DEFENCE_MULTIPLIER;
    default:
      return 1.0;
  }
}

/**
 * Returns the think-interval and action-budget settings for a given difficulty.
 * Easy thinks slowly and acts once; Hard thinks fast and can act three times per
 * tick. Extracted here so both ai.ts and any future UI tooltips share one source.
 */
export function getAIDifficultyTiming(difficulty: Difficulty): {
  minThinkSeconds: number;
  maxThinkSeconds: number;
  maxActionsPerThink: number;
} {
  if (difficulty === "easy") {
    return {
      minThinkSeconds: AI.EASY_THINK_MIN_SECONDS,
      maxThinkSeconds: AI.EASY_THINK_MAX_SECONDS,
      maxActionsPerThink: AI.EASY_MAX_ACTIONS_PER_THINK,
    };
  }

  if (difficulty === "hard") {
    return {
      minThinkSeconds: AI.HARD_THINK_MIN_SECONDS,
      maxThinkSeconds: AI.HARD_THINK_MAX_SECONDS,
      maxActionsPerThink: AI.HARD_MAX_ACTIONS_PER_THINK,
    };
  }

  return {
    minThinkSeconds: AI.NORMAL_THINK_MIN_SECONDS,
    maxThinkSeconds: AI.NORMAL_THINK_MAX_SECONDS,
    maxActionsPerThink: AI.NORMAL_MAX_ACTIONS_PER_THINK,
  };
}
