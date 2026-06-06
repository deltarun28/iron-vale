/**
 * simulation.ts — The game tick: troop production, action resolution, and neutral behaviour.
 *
 * updateGame() is called once per animation frame with the elapsed deltaSeconds.
 * It runs each subsystem in a fixed order so state changes from one step are
 * visible to the next:
 *
 *   1. Expire busy/cooldown timers
 *   2. Troop production
 *   3. Gold production
 *   4. Expire escrow timers
 *   5. Resolve completed actions
 *   6. Neutral aggression
 *   7. Neutral fortification
 *   8. Win-condition check
 */

import {
  FORT,
  NEUTRAL_MAX_TROOPS,
  PRODUCTION_CAPS,
  TROOP_PRODUCTION_PER_SECOND,
  VETERAN,
} from "./constants";
import { resolveCombat } from "./combat";
import { handleTileCaptureEconomy, updateGoldProduction } from "./economy";
import {
  canSeaAttackCaptureCapital,
  calculateLandMoveTime,
} from "./movement";
import {
  checkWinCondition,
  cloneGameState,
  expireEscrowTimers,
  getActivePlayerIds,
  isPlayer,
} from "./state";
import type {
  ActiveAction,
  GameState,
  OwnerId,
  PlayerId,
  TerrainType,
} from "./types";

// Neutral aggression runs every 3 seconds on Normal/Hard. Each at-cap neutral
// gets an independent 10% roll, so expected time between attacks on any given
// tile is roughly 30 seconds — frequent enough to punish neglect without
// constantly interrupting the player's plans.
const NEUTRAL_AGGRESSION_INTERVAL_SECONDS = 3;
const NEUTRAL_AGGRESSION_CHANCE = 0.10;
// Neutrals only attack tiles weakly held (< 3 troops) so they don't
// pile-on contested fronts but will reclaim abandoned outposts.
const NEUTRAL_INVASION_TROOP_THRESHOLD = 3;

// Neutral fortification: towns and bridges slowly build walls over time,
// making them progressively harder to capture the longer they go unchallenged.
// Runs every 5 seconds; 20% chance per eligible tile.
const NEUTRAL_FORTIFY_INTERVAL_SECONDS = 5;
const NEUTRAL_FORTIFY_CHANCE = 0.20;

// Capitals override the terrain production cap, so we need the right key.
function getProductionCapKey(params: {
  terrain: TerrainType;
  isCapital: boolean;
}): "plains" | "forest" | "mountain" | "capital" {
  if (params.isCapital) {
    return "capital";
  }

  return params.terrain;
}

// Neutral tiles use slower rates than player-owned tiles of the same terrain.
function getProductionRate(params: {
  terrain: TerrainType;
  isCapital: boolean;
  owner: OwnerId;
}): number {
  if (params.owner === "neutral") {
    switch (params.terrain) {
      case "plains":
        return TROOP_PRODUCTION_PER_SECOND.neutralPlains;
      case "forest":
        return TROOP_PRODUCTION_PER_SECOND.neutralForest;
      case "mountain":
        return TROOP_PRODUCTION_PER_SECOND.neutralMountain;
      default:
        return 0;
    }
  }

  if (params.isCapital) {
    return TROOP_PRODUCTION_PER_SECOND.capital;
  }

  return TROOP_PRODUCTION_PER_SECOND[params.terrain];
}

// Returns a value between 0 and 1 that throttles production as troops approach
// their cap. At the normal threshold the multiplier is 1. It tapers linearly
// to 0 at the stop threshold, creating a soft ceiling rather than a hard cutoff.
function getProductionMultiplier(troops: number, capKey: keyof typeof PRODUCTION_CAPS): number {
  const cap = PRODUCTION_CAPS[capKey];

  if (troops < cap.normalUntil) {
    return 1;
  }

  if (troops >= cap.stopsAt) {
    return 0;
  }

  const slowdownRange = cap.stopsAt - cap.normalUntil;
  const remaining = cap.stopsAt - troops;

  return Math.max(0, Math.min(1, remaining / slowdownRange));
}

// Gently reduces troops that are above the decay threshold, pulling them
// back toward the decay target. The rate scales with how far over they are.
function applyDecay(troops: number, deltaSeconds: number, capKey: keyof typeof PRODUCTION_CAPS): number {
  const cap = PRODUCTION_CAPS[capKey];

  if (troops <= cap.decaysAbove) {
    return troops;
  }

  const excess = troops - cap.decaysToward;

  const decayPerSecond = Math.max(0.1, excess * 0.04);
  const decayed = troops - decayPerSecond * deltaSeconds;

  return Math.max(cap.decaysToward, decayed);
}

// Advances troop production for every tile by deltaSeconds (the time elapsed
// since the last tick, in seconds). Busy player tiles are skipped.
// Neutral tiles continue producing regardless of busy state.
export function updateTroopProduction(state: GameState, deltaSeconds: number): GameState {
  const nextState = cloneGameState(state);

  for (const tile of Object.values(nextState.tiles)) {
    const definition = nextState.tileDefinitions[tile.id];

    if (!definition) {
      continue;
    }

    // Player-owned tiles that are busy do not produce.
    // Neutral tiles are not subject to busy-lock.
    const isBusy =
      tile.busyUntil !== null &&
      tile.busyUntil > nextState.now &&
      tile.owner !== "neutral";

    if (isBusy) {
      continue;
    }

    const capKey = getProductionCapKey({
      terrain: definition.terrain,
      isCapital: definition.isCapital,
    });

    const rate = getProductionRate({
      terrain: definition.terrain,
      isCapital: definition.isCapital,
      owner: tile.owner,
    });

    const multiplier = getProductionMultiplier(tile.troops, capKey);

    // Core production formula: rate * multiplier * time = troops gained this tick.
    const prevTroops = tile.troops;
    let nextTroops = tile.troops + rate * multiplier * deltaSeconds;

    if (tile.owner === "neutral") {
      nextTroops = Math.min(nextTroops, NEUTRAL_MAX_TROOPS);
    }

    nextTroops = applyDecay(nextTroops, deltaSeconds, capKey);

    tile.troops = nextTroops;

    // Accumulate net production for player-owned tiles (decay can reduce troops,
    // so only count the positive delta to avoid deflating the stat on over-cap tiles).
    if (isPlayer(tile.owner) && nextTroops > prevTroops) {
      const player = nextState.players[tile.owner];
      if (player) player.totalTroopsProduced += nextTroops - prevTroops;
    }
  }

  return nextState;
}

function resolveReinforceAction(state: GameState, action: ActiveAction): GameState {
  const nextState = cloneGameState(state);
  const target = nextState.tiles[action.targetTileId];

  if (!target) return nextState;

  // If there are more hops in a chained move, continue rather than deposit.
  if (action.remainingPath && action.remainingPath.length > 0) {
    const [nextTargetId, ...newRemaining] = action.remainingPath;
    if (!nextTargetId) {
      // Malformed path — deposit here as a safe fallback.
      target.troops += action.troopsSent;
      return nextState;
    }

    // If the intermediate tile was captured while troops were in transit, abort
    // the chain (troops are lost — they can't pass through enemy territory).
    if (target.owner !== action.owner) return nextState;

    const passThroughDef = nextState.tileDefinitions[action.targetTileId];
    const nextTargetDef = nextState.tileDefinitions[nextTargetId];
    if (!passThroughDef || !nextTargetDef) {
      target.troops += action.troopsSent;
      return nextState;
    }

    const legDuration = calculateLandMoveTime(passThroughDef, nextTargetDef, action.troopsSent);
    const legResolvesAt = nextState.now + legDuration;

    // Mark the pass-through tile busy while troops move on so it can't
    // simultaneously dispatch a second action in the same direction.
    target.busyUntil = legResolvesAt;

    // Strip remainingPath from the spread so the stale value never bleeds
    // into the next leg. Without this, the last leg before the destination
    // would inherit the old path, attempt C→C, and lock the tile forever.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { remainingPath: _stale, ...actionBase } = action;
    nextState.activeActions.push({
      ...actionBase,
      id: `action_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      sourceTileId: action.targetTileId,
      targetTileId: nextTargetId,
      startedAt: nextState.now,
      resolvesAt: legResolvesAt,
      ...(newRemaining.length > 0 ? { remainingPath: newRemaining } : {}),
    });

    return nextState;
  }

  // Final destination — deposit troops normally.
  target.troops += action.troopsSent;

  // Armour travels with troops.
  if (action.attackerArmoured) target.armoured = true;

  // Veteran levels travel with troops. Take the highest level between incoming and existing,
  // since the more experienced soldiers set the standard for the combined garrison.
  target.attackVetLevel = Math.max(target.attackVetLevel, action.attackerAttackVetLevel) as 0 | 1 | 2 | 3;
  target.defVetLevel = Math.max(target.defVetLevel, action.attackerDefVetLevel) as 0 | 1 | 2 | 3;

  return nextState;
}

function resolveAttackAction(state: GameState, action: ActiveAction): GameState {
  let nextState = cloneGameState(state);

  const target = nextState.tiles[action.targetTileId];
  const targetDefinition = nextState.tileDefinitions[action.targetTileId];

  if (!target || !targetDefinition) {
    return nextState;
  }

  // If the target is already owned by the attacker - which should not happen
  // after the busy-lock fix but guards against any residual race - just add
  // the troops instead of running combat against friendly forces.
  if (target.owner === action.owner) {
    target.troops += action.troopsSent;
    return nextState;
  }

  const previousOwner = target.owner;

  // Floor the troop counts so combat always operates on whole numbers.
  const defenderTroops = Math.max(0, Math.floor(target.troops));
  const attackerTroops = Math.max(0, Math.floor(action.troopsSent));

  const combat = resolveCombat({
    attackerTroops,
    defenderTroops,
    defenderTerrain: targetDefinition.terrain,
    defenderIsCapital: targetDefinition.isCapital,
    isSeaAttack: action.isSeaAction,
    attackerArmoured: action.attackerArmoured,
    attackerAttackVetLevel: action.attackerAttackVetLevel,
    defenderArmoured: target.armoured,
    defenderDefVetLevel: target.defVetLevel,
    defenderFortLevel: target.fortLevel,
    randomValue: Math.random(),
  });

  if (!combat.attackerWon) {
    target.troops = combat.defenderSurvivors;
    // Surviving defenders earn one defence veteran level from holding off the attack.
    target.defVetLevel = Math.min(VETERAN.MAX_LEVEL, target.defVetLevel + 1) as 0 | 1 | 2 | 3;
    return nextState;
  }

  // Sea raids cannot capture a capital unless the force is strong enough.
  const isBlockedSeaCapitalCapture =
    action.isSeaAction &&
    targetDefinition.isCapital &&
    !canSeaAttackCaptureCapital(attackerTroops, defenderTroops);

  if (isBlockedSeaCapitalCapture) {
    // The raid causes casualties but the capital holds.
    target.troops = Math.max(1, combat.defenderSurvivors);
    return nextState;
  }

  // Attacker wins and captures the tile. Enemy fortifications are destroyed.
  // The attacking troops bring their armour and vet levels, and earn +1 attack vet for winning.
  target.owner = action.owner;
  target.troops = combat.attackerSurvivors;
  // Fort level drops by 2 on capture (minimum 0) — the attackers damage the walls.
  target.fortLevel = Math.max(0, target.fortLevel - FORT.CAPTURE_LEVEL_REDUCTION) as 0 | 1 | 2 | 3 | 4 | 5;
  target.armoured = action.attackerArmoured;
  target.attackVetLevel = Math.min(VETERAN.MAX_LEVEL, action.attackerAttackVetLevel + 1) as 0 | 1 | 2 | 3;
  target.defVetLevel = action.attackerDefVetLevel;

  // handleTileCaptureEconomy runs escrow, gold freeze, and cap recalculations
  // regardless of who previously owned the tile.
  nextState = handleTileCaptureEconomy({
    state: nextState,
    capturedTileId: action.targetTileId,
    previousOwner,
    newOwner: action.owner,
  });

  return nextState;
}

// Finds all actions whose resolvesAt timestamp has passed, resolves them,
// and returns the updated state.
export function resolveCompletedActions(state: GameState): GameState {
  let nextState = cloneGameState(state);

  const completedActions = nextState.activeActions.filter(
    (action) => action.resolvesAt <= nextState.now
  );

  const pendingActions = nextState.activeActions.filter(
    (action) => action.resolvesAt > nextState.now
  );

  nextState.activeActions = pendingActions;

  for (const action of completedActions) {
    if (action.type === "land_reinforce" || action.type === "sea_move") {
      nextState = resolveReinforceAction(nextState, action);
    } else {
      nextState = resolveAttackAction(nextState, action);
    }
  }

  return nextState;
}

// Clears busy and embark cooldown timestamps that have expired this tick.
export function cleanupExpiredBusyStates(state: GameState): GameState {
  const nextState = cloneGameState(state);

  for (const tile of Object.values(nextState.tiles)) {
    if (tile.busyUntil !== null && tile.busyUntil <= nextState.now) {
      tile.busyUntil = null;
    }

    if (
      tile.embarkCooldownUntil !== null &&
      tile.embarkCooldownUntil <= nextState.now
    ) {
      tile.embarkCooldownUntil = null;
    }
  }

  return nextState;
}

// At-cap neutral tiles on Normal/Hard periodically attempt to reclaim weakly
// defended adjacent player tiles. Each eligible neutral tile gets an independent
// 10% chance every 3 seconds. Runs as an instant combat (no travel animation).
function updateNeutralAggression(state: GameState): GameState {
  if (state.ai.difficulty === "easy") return state;

  if (state.now - state.lastNeutralAggressionAt < NEUTRAL_AGGRESSION_INTERVAL_SECONDS) {
    return state;
  }

  // Collect all invasions that trigger this cycle before applying any of them,
  // so that state changes from one invasion don't alter the rolls for another.
  interface Invasion {
    sourceId: string;
    targetId: string;
  }

  const invasions: Invasion[] = [];

  const snap = state; // read-only snapshot for the roll phase

  for (const [tileId, tile] of Object.entries(snap.tiles)) {
    if (tile.owner !== "neutral") continue;
    if (tile.troops < NEUTRAL_MAX_TROOPS) continue;

    const definition = snap.tileDefinitions[tileId];
    if (!definition) continue;

    if (Math.random() >= NEUTRAL_AGGRESSION_CHANCE) continue;

    const targets = definition.adjacent.filter((adjId) => {
      const adjTile = snap.tiles[adjId];
      return (
        adjTile !== undefined &&
        adjTile.owner !== "neutral" &&
        adjTile.troops < NEUTRAL_INVASION_TROOP_THRESHOLD
      );
    });

    if (targets.length === 0) continue;

    const targetId = targets[Math.floor(Math.random() * targets.length)];
    if (targetId !== undefined) invasions.push({ sourceId: tileId, targetId });
  }

  if (invasions.length === 0) {
    // Still advance the timer so we don't re-roll immediately next tick.
    const nextState = cloneGameState(state);
    nextState.lastNeutralAggressionAt = state.now;
    return nextState;
  }

  let nextState = cloneGameState(state);
  nextState.lastNeutralAggressionAt = state.now;

  for (const { sourceId, targetId } of invasions) {
    const sourceTile = nextState.tiles[sourceId];
    const targetTile = nextState.tiles[targetId];
    const targetDef = nextState.tileDefinitions[targetId];

    if (!sourceTile || !targetTile || !targetDef) continue;
    // Re-validate: another invasion may have already changed ownership.
    if (sourceTile.owner !== "neutral") continue;
    if (targetTile.owner === "neutral") continue;
    if (targetTile.troops >= NEUTRAL_INVASION_TROOP_THRESHOLD) continue;

    const previousOwner = targetTile.owner as PlayerId;
    const troopsSent = Math.max(2, Math.floor(sourceTile.troops * 0.25));

    const combat = resolveCombat({
      attackerTroops: troopsSent,
      defenderTroops: Math.max(0, Math.floor(targetTile.troops)),
      defenderTerrain: targetDef.terrain,
      defenderIsCapital: targetDef.isCapital,
      isSeaAttack: false,
      attackerArmoured: false,
      attackerAttackVetLevel: 0,
      defenderArmoured: targetTile.armoured,
      defenderFortLevel: targetTile.fortLevel,
      defenderDefVetLevel: targetTile.defVetLevel,
      randomValue: Math.random(),
    });

    sourceTile.troops = Math.max(0, sourceTile.troops - troopsSent);

    if (combat.attackerWon) {
      targetTile.owner = "neutral";
      targetTile.troops = combat.attackerSurvivors;
      targetTile.armoured = false;
      targetTile.fortLevel = Math.max(0, targetTile.fortLevel - FORT.CAPTURE_LEVEL_REDUCTION) as 0 | 1 | 2 | 3 | 4 | 5;
      nextState = handleTileCaptureEconomy({
        state: nextState,
        capturedTileId: targetId,
        previousOwner,
        newOwner: "neutral",
      });
    } else {
      targetTile.troops = combat.defenderSurvivors;
    }
  }

  return nextState;
}

// Neutral towns and bridges self-fortify over time, making them progressively
// harder to capture the longer they go unchallenged.
function updateNeutralFortification(state: GameState): GameState {
  if (state.now - state.lastNeutralFortifyAt < NEUTRAL_FORTIFY_INTERVAL_SECONDS) {
    return state;
  }

  const nextState = cloneGameState(state);
  nextState.lastNeutralFortifyAt = state.now;

  for (const tile of Object.values(nextState.tiles)) {
    if (tile.owner !== "neutral") continue;
    if (tile.fortLevel >= FORT.MAX_LEVEL) continue;

    const definition = nextState.tileDefinitions[tile.id];
    if (!definition) continue;
    if (!definition.isTown && !definition.hasBridge) continue;

    if (Math.random() < NEUTRAL_FORTIFY_CHANCE) {
      tile.fortLevel = (tile.fortLevel + 1) as 0 | 1 | 2 | 3 | 4 | 5;
    }
  }

  return nextState;
}

// The main update function, called once per animation frame.
// deltaSeconds is how much real time has passed since the last frame.
// Capping it at 0.05 (20fps minimum) prevents huge jumps if the tab was hidden.
export function updateGame(state: GameState, deltaSeconds: number): GameState {
  if (state.phase !== "playing") {
    return state;
  }

  let nextState = cloneGameState(state);
  nextState.now += deltaSeconds;

  // Order matters: clean up old timers before checking production,
  // then resolve gold, then resolve completed actions, then check victory.
  nextState = cleanupExpiredBusyStates(nextState);
  nextState = updateTroopProduction(nextState, deltaSeconds);
  nextState = updateGoldProduction(nextState, deltaSeconds);
  nextState = expireEscrowTimers(nextState);
  nextState = resolveCompletedActions(nextState);
  nextState = updateNeutralAggression(nextState);
  nextState = updateNeutralFortification(nextState);

  // Update each player's peak tile count after all ownership changes this tick.
  for (const playerId of getActivePlayerIds(nextState)) {
    const player = nextState.players[playerId];
    if (!player) continue;
    const currentTiles = Object.values(nextState.tiles).filter(
      (t) => t.owner === playerId
    ).length;
    if (currentTiles > player.peakTilesHeld) player.peakTilesHeld = currentTiles;
  }

  nextState = checkWinCondition(nextState);

  return nextState;
}
