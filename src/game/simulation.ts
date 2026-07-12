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
  EASY_PRODUCTION_MULTIPLIER,
  FORT,
  NEUTRAL_MAX_TROOPS,
  PRODUCTION_CAPS,
  TROOP_PRODUCTION_PER_SECOND,
  incrementFortLevel,
  incrementVetLevel,
  maxVetLevel,
  reduceFortLevelOnCapture,
} from "./constants";
import {
  getTerritoriesForMap,
  getTerritoryBonus,
  getTerritoryController,
} from "./territories";
import { resolveCombat } from "./combat";
import { applyGoldProduction, handleTileCaptureEconomy } from "./economy";
import { canSeaAttackCaptureCapital } from "./movement";
import {
  applyEscrowExpiry,
  checkWinCondition,
  cloneGameState,
  getActivePlayerIds,
  isPlayer,
} from "./state";
import { createLandAction } from "./actions";
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
// Exported for the hard AI's arrival-time projection (public information).
export function getProductionCapKey(params: {
  terrain: TerrainType;
  isCapital: boolean;
}): "plains" | "forest" | "mountain" | "capital" {
  if (params.isCapital) {
    return "capital";
  }

  return params.terrain;
}

// Neutral tiles use slower rates than player-owned tiles of the same terrain.
// Exported for the hard AI's arrival-time projection (public information).
export function getProductionRate(params: {
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
// Mutates the draft in place — callers must own the state (see updateGame).
function applyTroopProduction(draft: GameState, deltaSeconds: number): void {
  const difficultyMultiplier = draft.ai.difficulty === "easy" ? EASY_PRODUCTION_MULTIPLIER : 1;

  // Compute the flat troops/s bonus each player earns from fully-controlled territories.
  // The bonus is added to every tile they own on top of normal terrain production.
  const territoryBonusPerPlayer: Partial<Record<PlayerId, number>> = {};
  for (const territory of getTerritoriesForMap(draft.mapId)) {
    const controller = getTerritoryController(territory, draft.tiles);
    if (controller !== null) {
      const bonus = getTerritoryBonus(territory);
      territoryBonusPerPlayer[controller] = (territoryBonusPerPlayer[controller] ?? 0) + bonus;
    }
  }

  for (const tile of Object.values(draft.tiles)) {
    const definition = draft.tileDefinitions[tile.id];

    if (!definition) {
      continue;
    }

    // Player-owned tiles that are busy do not produce.
    // Neutral tiles are not subject to busy-lock.
    const isBusy =
      tile.busyUntil !== null &&
      tile.busyUntil > draft.now &&
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

    // Core production formula: (terrain rate + territory bonus) × time = troops gained this tick.
    // Territory bonus bypasses the cap multiplier — it's a strategic bonus, not terrain production.
    const territoryBonus = isPlayer(tile.owner) ? (territoryBonusPerPlayer[tile.owner] ?? 0) : 0;
    const prevTroops = tile.troops;
    let nextTroops = tile.troops + (rate * multiplier + territoryBonus) * deltaSeconds * difficultyMultiplier;

    if (tile.owner === "neutral") {
      nextTroops = Math.min(nextTroops, NEUTRAL_MAX_TROOPS);
    }

    nextTroops = applyDecay(nextTroops, deltaSeconds, capKey);

    tile.troops = nextTroops;

    // Accumulate net production for player-owned tiles (decay can reduce troops,
    // so only count the positive delta to avoid deflating the stat on over-cap tiles).
    if (isPlayer(tile.owner) && nextTroops > prevTroops) {
      const player = draft.players[tile.owner];
      if (player) player.totalTroopsProduced += nextTroops - prevTroops;
    }
  }
}

// Mutates the draft in place — callers must own the state (see updateGame).
// May return a successor state when the chain continues (createLandAction is
// immutable and returns a fresh state).
function resolveReinforceAction(draft: GameState, action: ActiveAction): GameState {
  const target = draft.tiles[action.targetTileId];

  if (!target) return draft;

  // If there are more hops in a chained move, deposit troops then hand off to
  // continueChain, which re-applies the fraction and correctly dispatches the
  // next leg as an attack or reinforce depending on who owns that tile.
  if (action.remainingPath && action.remainingPath.length > 0) {
    if (!action.remainingPath[0]) {
      // Malformed path — deposit here as a safe fallback.
      target.troops += action.troopsSent;
      return draft;
    }

    // Abort if this pass-through tile was captured — troops can't cross enemy territory.
    if (target.owner !== action.owner) return draft;

    target.troops += action.troopsSent;
    return continueChain(draft, action, action.targetTileId);
  }

  // If the tile was captured while troops were in transit, attack it instead
  // of reinforcing the enemy who now holds it.
  if (target.owner !== action.owner) {
    return resolveAttackAction(draft, { ...action, type: "land_attack" });
  }

  // Final destination — deposit troops normally.
  target.troops += action.troopsSent;

  // Armour travels with troops.
  if (action.attackerArmoured) target.armoured = true;

  // Veteran levels travel with troops. Take the highest level between incoming and existing,
  // since the more experienced soldiers set the standard for the combined garrison.
  target.attackVetLevel = maxVetLevel(target.attackVetLevel, action.attackerAttackVetLevel);
  target.defVetLevel = maxVetLevel(target.defVetLevel, action.attackerDefVetLevel);

  return draft;
}

// After a tile is taken or reinforced, continue a chained move to the next hop
// by re-applying sendFraction to the new tile total.
function continueChain(state: GameState, action: ActiveAction, fromTileId: string): GameState {
  if (!action.remainingPath || action.remainingPath.length === 0) return state;

  const [nextTileId, ...rest] = action.remainingPath;
  if (!nextTileId) return state;

  const tile = state.tiles[fromTileId];
  if (!tile || tile.owner !== action.owner) return state;

  const fraction = action.sendFraction ?? 1;
  const nextTroopsSent = Math.min(
    Math.max(1, Math.floor(tile.troops * fraction)),
    tile.troops - 1
  );

  return createLandAction({
    state,
    playerId: action.owner,
    sourceTileId: fromTileId,
    targetTileId: nextTileId,
    troopsSent: nextTroopsSent,
    ...(rest.length > 0 ? { remainingPath: rest } : {}),
    sendFraction: fraction,
  });
}

// Mutates the draft in place — callers must own the state (see updateGame).
// Returns a successor state when capture economics run (those helpers are
// immutable) or when a chained move continues.
function resolveAttackAction(draft: GameState, action: ActiveAction): GameState {
  let nextState = draft;

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
    return continueChain(nextState, action, action.targetTileId);
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

  // Record the combat so the renderer can play clash effects and show losses.
  nextState.combatEvents.push({
    time: nextState.now,
    targetTileId: action.targetTileId,
    attackerOwner: action.owner,
    defenderOwner: previousOwner,
    attackerWon: combat.attackerWon,
    attackerLosses: attackerTroops - combat.attackerSurvivors,
    defenderLosses: defenderTroops - combat.defenderSurvivors,
  });

  if (!combat.attackerWon) {
    target.troops = combat.defenderSurvivors;
    // Surviving defenders earn one defence veteran level from holding off the attack.
    target.defVetLevel = incrementVetLevel(target.defVetLevel);
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
  target.fortLevel = reduceFortLevelOnCapture(target.fortLevel);
  target.armoured = action.attackerArmoured;
  target.attackVetLevel = incrementVetLevel(action.attackerAttackVetLevel);
  target.defVetLevel = action.attackerDefVetLevel;

  // handleTileCaptureEconomy runs escrow, gold freeze, and cap recalculations
  // regardless of who previously owned the tile.
  nextState = handleTileCaptureEconomy({
    state: nextState,
    capturedTileId: action.targetTileId,
    previousOwner,
    newOwner: action.owner,
  });

  return continueChain(nextState, action, action.targetTileId);
}

// Finds all actions whose resolvesAt timestamp has passed, resolves them,
// and returns the updated state. Mutates the draft in place — callers must
// own the state (see updateGame). No-op (and allocation-free apart from the
// filter) on the common frame where nothing has completed.
function applyCompletedActions(draft: GameState): GameState {
  const completedActions = draft.activeActions.filter(
    (action) => action.resolvesAt <= draft.now
  );

  if (completedActions.length === 0) return draft;

  draft.activeActions = draft.activeActions.filter(
    (action) => action.resolvesAt > draft.now
  );

  let nextState = draft;
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
// Mutates the draft in place — callers must own the state (see updateGame).
function applyExpiredBusyCleanup(draft: GameState): void {
  for (const tile of Object.values(draft.tiles)) {
    if (tile.busyUntil !== null && tile.busyUntil <= draft.now) {
      tile.busyUntil = null;
    }

    if (
      tile.embarkCooldownUntil !== null &&
      tile.embarkCooldownUntil <= draft.now
    ) {
      tile.embarkCooldownUntil = null;
    }
  }
}

// At-cap neutral tiles on Normal/Hard periodically attempt to reclaim weakly
// defended adjacent player tiles. Each eligible neutral tile gets an independent
// 10% chance every 3 seconds. Runs as an instant combat (no travel animation).
// Mutates the draft in place — callers must own the state (see updateGame).
// Returns a successor state when a capture triggers the economy helpers.
function applyNeutralAggression(draft: GameState): GameState {
  if (draft.ai.difficulty === "easy") return draft;

  if (draft.now - draft.lastNeutralAggressionAt < NEUTRAL_AGGRESSION_INTERVAL_SECONDS) {
    return draft;
  }

  draft.lastNeutralAggressionAt = draft.now;

  // Collect all invasions that trigger this cycle before applying any of them,
  // so that state changes from one invasion don't alter the rolls for another.
  interface Invasion {
    sourceId: string;
    targetId: string;
  }

  const invasions: Invasion[] = [];

  for (const [tileId, tile] of Object.entries(draft.tiles)) {
    if (tile.owner !== "neutral") continue;
    if (tile.troops < NEUTRAL_MAX_TROOPS) continue;

    const definition = draft.tileDefinitions[tileId];
    if (!definition) continue;

    if (Math.random() >= NEUTRAL_AGGRESSION_CHANCE) continue;

    const targets = definition.adjacent.filter((adjId) => {
      const adjTile = draft.tiles[adjId];
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

  if (invasions.length === 0) return draft;

  let nextState = draft;

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

    nextState.combatEvents.push({
      time: nextState.now,
      targetTileId: targetId,
      attackerOwner: "neutral",
      defenderOwner: previousOwner,
      attackerWon: combat.attackerWon,
      attackerLosses: troopsSent - combat.attackerSurvivors,
      defenderLosses: Math.floor(targetTile.troops) - combat.defenderSurvivors,
    });

    if (combat.attackerWon) {
      targetTile.owner = "neutral";
      targetTile.troops = combat.attackerSurvivors;
      targetTile.armoured = false;
      targetTile.fortLevel = reduceFortLevelOnCapture(targetTile.fortLevel);
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
// Mutates the draft in place — callers must own the state (see updateGame).
function applyNeutralFortification(draft: GameState): void {
  if (draft.now - draft.lastNeutralFortifyAt < NEUTRAL_FORTIFY_INTERVAL_SECONDS) {
    return;
  }

  draft.lastNeutralFortifyAt = draft.now;

  for (const tile of Object.values(draft.tiles)) {
    if (tile.owner !== "neutral") continue;
    if (tile.fortLevel >= FORT.MAX_LEVEL) continue;

    const definition = draft.tileDefinitions[tile.id];
    if (!definition) continue;
    if (!definition.isTown && !definition.hasBridge) continue;

    if (Math.random() < NEUTRAL_FORTIFY_CHANCE) {
      tile.fortLevel = incrementFortLevel(tile.fortLevel);
    }
  }
}

// The main update function, called once per animation frame.
// deltaSeconds is how much real time has passed since the last frame.
// Capping it at 0.05 (20fps minimum) prevents huge jumps if the tab was hidden.
//
// The state is cloned ONCE here; each subsystem below mutates that owned
// draft in place rather than re-cloning (this runs at 60fps, so per-subsystem
// clones were the main source of GC pressure). Subsystems that go through the
// immutable capture-economy helpers return a successor state instead.
export function updateGame(state: GameState, deltaSeconds: number): GameState {
  if (state.phase !== "playing") {
    return state;
  }

  let nextState = cloneGameState(state);
  nextState.now += deltaSeconds;

  // Order matters: clean up old timers before checking production,
  // then resolve gold, then resolve completed actions, then check victory.
  applyExpiredBusyCleanup(nextState);
  applyTroopProduction(nextState, deltaSeconds);
  applyGoldProduction(nextState, deltaSeconds);
  applyEscrowExpiry(nextState);
  nextState = applyCompletedActions(nextState);
  nextState = applyNeutralAggression(nextState);
  applyNeutralFortification(nextState);

  // Drop combat events once their render effects have long finished.
  if (nextState.combatEvents.length > 0) {
    nextState.combatEvents = nextState.combatEvents.filter(
      (event) => nextState.now - event.time < 4
    );
  }

  // Update each player's peak tile count after all ownership changes this tick.
  const tileCounts: Partial<Record<PlayerId, number>> = {};
  for (const playerId of getActivePlayerIds(nextState)) {
    const player = nextState.players[playerId];
    if (!player) continue;
    const currentTiles = Object.values(nextState.tiles).filter(
      (t) => t.owner === playerId
    ).length;
    tileCounts[playerId] = currentTiles;
    if (currentTiles > player.peakTilesHeld) player.peakTilesHeld = currentTiles;
  }

  // Sample the match timeline every 5s of game time for the end-screen chart.
  // The array is replaced, not mutated, so clones sharing it stay consistent.
  const lastSample = nextState.timeline[nextState.timeline.length - 1];
  if (!lastSample || nextState.now - lastSample.t >= 5) {
    nextState.timeline = [...nextState.timeline, { t: nextState.now, tiles: tileCounts }];
  }

  nextState = checkWinCondition(nextState);

  return nextState;
}
