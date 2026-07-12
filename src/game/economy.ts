/**
 * economy.ts — Gold production, spending, and the capital-loss escrow mechanic.
 *
 * Gold is produced every tick by player-owned capitals and towns. When a player
 * loses a capital while holding more gold than their new cap, half the excess is
 * lost immediately and half enters escrow — recoverable by retaking the capital
 * within CAPITAL_RECLAIM_WINDOW_SECONDS.
 *
 * All functions follow the immutable-state pattern: they accept the current
 * GameState, clone it, mutate the clone, and return it.
 */

import {
  GOLD_FREEZE_SECONDS,
  GOLD_PRODUCTION_PER_SECOND,
} from "./constants";
import {
  calculateGoldCap,
  cloneGameState,
  countCapitalsHeld,
  getActivePlayerIds,
  handleCapitalLossEscrow,
  handleCapitalReclaimEscrow,
  isPlayer,
} from "./state";
import type {
  GameState,
  OwnerId,
  PlayerId,
} from "./types";

// Drips gold into each player's total for capitals and towns they own.
// Gold is capped at the player's current goldCap and pauses if goldFrozenUntil
// is active. Mutates the draft in place — callers must own the state (see
// updateGame's single-clone tick). Use updateGoldProduction for an immutable version.
export function applyGoldProduction(draft: GameState, deltaSeconds: number): void {
  for (const tile of Object.values(draft.tiles)) {
    const definition = draft.tileDefinitions[tile.id];

    if (!definition) {
      continue;
    }

    // Only player-owned capitals and towns produce gold.
    if (!isPlayer(tile.owner)) {
      continue;
    }

    if (!definition.isCapital && !definition.isTown) {
      continue;
    }

    // Gold production is frozen briefly after a capture.
    if (tile.goldFrozenUntil !== null && tile.goldFrozenUntil > draft.now) {
      continue;
    }

    const player = draft.players[tile.owner];
    if (!player) continue;

    const goldRate = definition.isCapital
      ? GOLD_PRODUCTION_PER_SECOND.capital
      : GOLD_PRODUCTION_PER_SECOND.town;

    const goldBefore = player.gold;
    // Math.min ensures gold can never exceed the cap.
    player.gold = Math.min(player.goldCap, player.gold + goldRate * deltaSeconds);
    // Track total earned separately so the end screen isn't 0 for the loser.
    player.totalGoldEarned += player.gold - goldBefore;
  }
}

/** Immutable wrapper around applyGoldProduction. */
export function updateGoldProduction(state: GameState, deltaSeconds: number): GameState {
  const nextState = cloneGameState(state);
  applyGoldProduction(nextState, deltaSeconds);
  return nextState;
}

// Starts the gold freeze timer on a tile when it changes hands.
// The freeze applies only to gold production - troop generation is unaffected.
export function applyGoldFreezeOnCapture(
  state: GameState,
  capturedTileId: string
): GameState {
  const nextState = cloneGameState(state);
  const definition = nextState.tileDefinitions[capturedTileId];
  const tile = nextState.tiles[capturedTileId];

  if (!definition || !tile) {
    return nextState;
  }

  if (definition.isCapital) {
    tile.goldFrozenUntil = nextState.now + GOLD_FREEZE_SECONDS.capital;
  } else if (definition.isTown) {
    tile.goldFrozenUntil = nextState.now + GOLD_FREEZE_SECONDS.town;
  }

  return nextState;
}

// Recomputes gold caps for every active player based on how many capitals
// they currently hold. Called after any capture so caps stay in sync.
export function updateCapitalCountsAndCaps(state: GameState): GameState {
  const nextState = cloneGameState(state);

  for (const playerId of getActivePlayerIds(nextState)) {
    const player = nextState.players[playerId];
    if (!player) continue;

    const capitalsHeld = countCapitalsHeld(
      playerId,
      nextState.tiles,
      nextState.tileDefinitions
    );
    const goldCap = calculateGoldCap(capitalsHeld);

    player.capitalsHeld = capitalsHeld;
    player.goldCap = goldCap;
    // If the new cap is lower than current gold, clamp gold down immediately.
    player.gold = Math.min(player.gold, goldCap);
  }

  return nextState;
}

// Orchestrates all economy changes when a tile is captured: gold freeze,
// capital escrow for the loser, cap recalculation, and escrow reclaim for the winner.
export function handleTileCaptureEconomy(params: {
  state: GameState;
  capturedTileId: string;
  previousOwner: OwnerId;
  newOwner: OwnerId;
}): GameState {
  let nextState = cloneGameState(params.state);
  const definition = nextState.tileDefinitions[params.capturedTileId];

  if (!definition) {
    return nextState;
  }

  // Track losses for the end-of-match achievements (flawless / comeback).
  if (isPlayer(params.previousOwner)) {
    const loser = nextState.players[params.previousOwner];
    if (loser) {
      loser.tilesLost += 1;
      if (definition.isCapital) loser.capitalsLost += 1;
    }
  }

  nextState = applyGoldFreezeOnCapture(nextState, params.capturedTileId);

  // If a player-owned capital was taken, run the escrow mechanic on the loser.
  if (definition.isCapital && isPlayer(params.previousOwner)) {
    nextState = handleCapitalLossEscrow(
      nextState,
      params.previousOwner,
      params.capturedTileId
    );
  }

  nextState = updateCapitalCountsAndCaps(nextState);

  // If a capital was recaptured by a player, check if they can reclaim escrow.
  if (definition.isCapital && isPlayer(params.newOwner)) {
    nextState = handleCapitalReclaimEscrow(
      nextState,
      params.newOwner,
      params.capturedTileId
    );
  }

  return nextState;
}

// Deducts gold from a player. Throws if the player cannot afford it,
// so callers must validate affordability first (validateSeaAction does this).
export function spendGold(
  state: GameState,
  playerId: PlayerId,
  amount: number
): GameState {
  const nextState = cloneGameState(state);
  const player = nextState.players[playerId];

  if (amount < 0) {
    throw new Error("Cannot spend a negative amount of gold.");
  }

  if (!player) {
    throw new Error(`spendGold called with inactive player: ${playerId}`);
  }

  if (player.gold < amount) {
    throw new Error("Player does not have enough gold.");
  }

  player.gold -= amount;

  return nextState;
}
