/**
 * actions.ts — Creates land and sea actions and adds them to activeActions.
 *
 * Actions are not executed immediately. createLandAction and createSeaAction
 * deduct troops from the source tile, set busy timers, and push an ActiveAction
 * onto the queue. The simulation resolves each action when `state.now` reaches
 * its `resolvesAt` timestamp.
 *
 * The public entry point for player input is createBestAvailableAction, which
 * automatically routes to sea if a lane exists, otherwise falls back to land.
 */

import { calculateCombatResolutionTime } from "./combat";
import { ARMOUR, FORT, incrementFortLevel } from "./constants";
import { spendGold } from "./economy";
import {
  calculateEmbarkCooldownSeconds,
  calculateLandAttackTime,
  calculateLandMoveTime,
  calculateSeaAttackTime,
  calculateSeaCost,
  calculateSeaMoveTime,
  findSeaLaneBetween,
  shouldSeaAttackBusyLockDefender,
  validateLandAction,
  validateSeaAction,
} from "./movement";
import { cloneGameState } from "./state";
import type {
  ActiveAction,
  ActionType,
  GameState,
  PlayerId,
} from "./types";

// Generates a unique ID for each action. Using Date.now() plus a random hex
// string makes collisions practically impossible without needing a counter.
// Exported for the simulation, which creates continuation and return-home
// actions directly (their troops are already in flight — no tile deduction).
export function createActionId(): string {
  return `action_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

// Rendered progress fraction of an in-flight action at time t: where along the
// source→target path the marker is drawn, accounting for mid-path starts.
function getRenderedProgressAt(action: ActiveAction, t: number): number {
  const duration = action.resolvesAt - action.startedAt;
  const raw = duration > 0 ? (t - action.startedAt) / duration : 1;
  const start = action.pathStartFraction ?? 0;
  return start + (1 - start) * raw;
}

// By default, the player sends half their available troops. This is the
// standard "50 percent" rule described in the design docs.
function getDefaultTroopsToSend(sourceTroops: number): number {
  return Math.max(1, Math.floor(sourceTroops * 0.5));
}

// Creates a land movement or attack action and returns the updated game state.
// The action is not executed immediately - it is added to activeActions and
// resolved later by the simulation when resolvesAt time is reached.
export function createLandAction(params: {
  state: GameState;
  playerId: PlayerId;
  sourceTileId: string;
  targetTileId: string;
  troopsSent?: number;      // optional: defaults to 50% of source troops
  remainingPath?: string[]; // set by createChainedReinforceAction for multi-hop moves
  sendFraction?: number;    // fraction to re-apply at each intermediate hop
}): GameState {
  const nextState = cloneGameState(params.state);

  const source = nextState.tiles[params.sourceTileId];
  const target = nextState.tiles[params.targetTileId];
  const sourceDefinition = nextState.tileDefinitions[params.sourceTileId];
  const targetDefinition = nextState.tileDefinitions[params.targetTileId];

  if (!source || !target || !sourceDefinition || !targetDefinition) {
    return nextState;
  }

  // The ?? operator uses the right side if the left is null or undefined.
  const troopsSent =
    params.troopsSent ?? getDefaultTroopsToSend(source.troops);

  const validation = validateLandAction({
    state: nextState,
    playerId: params.playerId,
    sourceTileId: params.sourceTileId,
    targetTileId: params.targetTileId,
    troopsSent,
  });

  if (!validation.valid) {
    return nextState;
  }

  const isAttack = target.owner !== params.playerId;

  // Combat resolution time is only relevant for attacks; reinforcements are instant on arrival.
  const combatResolutionTime = isAttack
    ? calculateCombatResolutionTime(troopsSent, target.troops)
    : 0;

  const defenderFortLevel = isAttack ? target.fortLevel : 0;

  const duration = isAttack
    ? calculateLandAttackTime(
        sourceDefinition,
        targetDefinition,
        troopsSent,
        combatResolutionTime,
        source.attackVetLevel,
        defenderFortLevel
      )
    : calculateLandMoveTime(sourceDefinition, targetDefinition, troopsSent);

  const resolvesAt = nextState.now + duration;

  const actionType: ActionType = isAttack ? "land_attack" : "land_reinforce";

  const action: ActiveAction = {
    id: createActionId(),
    type: actionType,
    owner: params.playerId,
    sourceTileId: params.sourceTileId,
    targetTileId: params.targetTileId,
    troopsSent,
    startedAt: nextState.now,
    resolvesAt,
    isSeaAction: false,
    targetBusyLocked: true,
    attackerArmoured: source.armoured,
    attackerAttackVetLevel: source.attackVetLevel,
    attackerDefVetLevel: source.defVetLevel,
    defenderFortLevel,
    ...(params.remainingPath ? { remainingPath: params.remainingPath } : {}),
    ...(params.sendFraction !== undefined ? { sendFraction: params.sendFraction } : {}),
  };

  // Troops leave the source tile immediately. Armour is consumed (it travels with the troops).
  // Veteran levels are NOT consumed — experience stays with the remaining garrison too.
  source.troops -= troopsSent;
  source.armoured = false;

  // Source tile is busy for the duration so it cannot send a second action.
  source.busyUntil = resolvesAt;
  // Only busy-lock the target for reinforcements (prevents a second friendly
  // reinforce queuing to the same destination). For attacks we leave the
  // target unlocked so the defender can still dispatch troops from a tile
  // that is under assault — locking it was silently blocking counterplay.
  if (!isAttack) {
    // Extend (don't overwrite) the target busy lock so an in-flight combat
    // lock isn't cleared by a reinforcement queuing to the same tile.
    target.busyUntil = Math.max(target.busyUntil ?? 0, resolvesAt);
  }

  // ── Head-on collision check ────────────────────────────────────────────────
  // If there is already a land_attack heading in exactly the opposite direction
  // (from our target back to our source), the two armies will meet in the open
  // field. Schedule the battle for the moment their rendered positions actually
  // meet (progress fractions summing to 1) — the simulation resolves the pair
  // there and the winner carries on from that spot.
  if (isAttack) {
    const opposing = nextState.activeActions.find(
      (a) =>
        a.type === "land_attack" &&
        a.sourceTileId === params.targetTileId &&
        a.targetTileId === params.sourceTileId &&
        a.collisionPartnerId === undefined
    );

    if (opposing) {
      // Solve startA + kA·(t − sA) + (t − now)/dB = 1 for the meeting time,
      // where kA scales the opposing army's remaining path over its duration.
      const durA = opposing.resolvesAt - opposing.startedAt;
      const startA = opposing.pathStartFraction ?? 0;
      const kA = (1 - startA) / Math.max(0.001, durA);
      const durB = duration;
      const tMeet =
        (1 - startA + kA * opposing.startedAt + nextState.now / durB) /
        (kA + 1 / durB);

      opposing.collisionPartnerId = action.id;
      opposing.collisionMeetFraction = getRenderedProgressAt(opposing, tMeet);
      opposing.resolvesAt = tMeet;

      action.collisionPartnerId = opposing.id;
      action.collisionMeetFraction = (tMeet - nextState.now) / durB;
      action.resolvesAt = tMeet;

      // Both source tiles stay busy until the battle resolves; the winner's is
      // re-extended when its continuation is created. Unlocking the defender's
      // source at tMeet (instead of its army's original arrival time) is fair —
      // its army's fate is decided then.
      source.busyUntil = tMeet;
      const opposingSource = nextState.tiles[opposing.sourceTileId];
      if (opposingSource && opposingSource.owner === opposing.owner) {
        opposingSource.busyUntil = tMeet;
      }
    }
  }
  // ── End head-on collision check ───────────────────────────────────────────

  nextState.activeActions.push(action);

  return nextState;
}

// Creates a sea movement or sea attack action. Sea actions cost gold,
// apply an embark cooldown on the source, and use different timing formulas.
export function createSeaAction(params: {
  state: GameState;
  playerId: PlayerId;
  sourceTileId: string;
  targetTileId: string;
  troopsSent?: number;
}): GameState {
  let nextState = cloneGameState(params.state);

  const source = nextState.tiles[params.sourceTileId];
  const target = nextState.tiles[params.targetTileId];
  const sourceDefinition = nextState.tileDefinitions[params.sourceTileId];
  const targetDefinition = nextState.tileDefinitions[params.targetTileId];

  if (!source || !target || !sourceDefinition || !targetDefinition) {
    return nextState;
  }

  const lane = findSeaLaneBetween(
    nextState.seaLanes,
    params.sourceTileId,
    params.targetTileId
  );

  if (!lane) {
    return nextState;
  }

  const troopsSent =
    params.troopsSent ?? getDefaultTroopsToSend(source.troops);

  const validation = validateSeaAction({
    state: nextState,
    playerId: params.playerId,
    sourceTileId: params.sourceTileId,
    targetTileId: params.targetTileId,
    troopsSent,
  });

  if (!validation.valid) {
    return nextState;
  }

  const seaCost = calculateSeaCost({
    troopsSent,
    sourceDefinition,
    sourceState: source,
    targetDefinition,
    targetState: target,
  });

  // Deduct gold before creating the action. spendGold returns a new state.
  nextState = spendGold(nextState, params.playerId, seaCost.cost);

  // Re-read tile references from the new state after spendGold.
  const nextSource = nextState.tiles[params.sourceTileId];
  const nextTarget = nextState.tiles[params.targetTileId];

  if (!nextSource || !nextTarget) {
    return nextState;
  }

  const isAttack = nextTarget.owner !== params.playerId;

  const combatResolutionTime = isAttack
    ? calculateCombatResolutionTime(troopsSent, nextTarget.troops)
    : 0;

  const seaDefenderFortLevel = isAttack ? nextTarget.fortLevel : 0;

  const duration = isAttack
    ? calculateSeaAttackTime(lane.distance, combatResolutionTime, nextSource.attackVetLevel, seaDefenderFortLevel)
    : calculateSeaMoveTime(lane.distance);

  const resolvesAt = nextState.now + duration;

  // Sea attacks only busy-lock the defender if the force is large enough
  // relative to the garrison (it's a raid otherwise, not a full invasion).
  const targetBusyLocked =
    isAttack &&
    nextTarget.owner !== "neutral" &&
    shouldSeaAttackBusyLockDefender(troopsSent, nextTarget.troops);

  const actionType: ActionType = isAttack ? "sea_attack" : "sea_move";

  const action: ActiveAction = {
    id: createActionId(),
    type: actionType,
    owner: params.playerId,
    sourceTileId: params.sourceTileId,
    targetTileId: params.targetTileId,
    troopsSent,
    startedAt: nextState.now,
    resolvesAt,
    isSeaAction: true,
    targetBusyLocked,
    attackerArmoured: nextSource.armoured,
    attackerAttackVetLevel: nextSource.attackVetLevel,
    attackerDefVetLevel: nextSource.defVetLevel,
    defenderFortLevel: seaDefenderFortLevel,
  };

  // Armour is consumed; veteran levels stay on the source garrison.
  nextSource.troops -= troopsSent;
  nextSource.armoured = false;

  // The embark cooldown prevents the source from launching another sea action
  // immediately after - towns and capitals have a shorter cooldown.
  nextSource.embarkCooldownUntil =
    nextState.now + calculateEmbarkCooldownSeconds(sourceDefinition);

  if (targetBusyLocked) {
    nextTarget.busyUntil = resolvesAt;
  }

  // ── Head-on collision check (sea) ──────────────────────────────────────────
  // Two sea attacks crossing the same lane in opposite directions meet on the
  // water. Same scheduling as land collisions: pair them, set both to resolve
  // at the meeting point, and let the simulation fight it out at sea (where
  // armour and veteran bonuses don't apply — see resolveFieldBattle).
  if (isAttack) {
    const opposing = nextState.activeActions.find(
      (a) =>
        a.type === "sea_attack" &&
        a.sourceTileId === params.targetTileId &&
        a.targetTileId === params.sourceTileId &&
        a.collisionPartnerId === undefined
    );

    if (opposing) {
      const durA = opposing.resolvesAt - opposing.startedAt;
      const startA = opposing.pathStartFraction ?? 0;
      const kA = (1 - startA) / Math.max(0.001, durA);
      const durB = duration;
      const tMeet =
        (1 - startA + kA * opposing.startedAt + nextState.now / durB) /
        (kA + 1 / durB);

      // Release the defender busy-locks the two invasions placed on each
      // other's home tiles — the armies' fate is decided at sea at tMeet.
      // Only shorten locks these specific actions set, never someone else's.
      if (opposing.targetBusyLocked) {
        const opposingTarget = nextState.tiles[opposing.targetTileId];
        if (opposingTarget && opposingTarget.busyUntil === opposing.resolvesAt) {
          opposingTarget.busyUntil = tMeet;
        }
      }
      if (targetBusyLocked && nextTarget.busyUntil === resolvesAt) {
        nextTarget.busyUntil = tMeet;
      }

      opposing.collisionPartnerId = action.id;
      opposing.collisionMeetFraction =
        startA + kA * (tMeet - opposing.startedAt);
      opposing.resolvesAt = tMeet;

      action.collisionPartnerId = opposing.id;
      action.collisionMeetFraction = (tMeet - nextState.now) / durB;
      action.resolvesAt = tMeet;
    }
  }
  // ── End head-on collision check ────────────────────────────────────────────

  nextState.activeActions.push(action);

  return nextState;
}

// Upgrades the fortification of an owned tile by one level (max 5).
// Each level costs 5g and keeps the tile busy for 4 seconds while building.
export function buildFortification(params: {
  state: GameState;
  playerId: PlayerId;
  tileId: string;
}): GameState {
  const nextState = cloneGameState(params.state);
  const tile = nextState.tiles[params.tileId];
  const player = nextState.players[params.playerId];

  if (!tile || tile.owner !== params.playerId) return nextState;
  if (!player) return nextState;
  if (tile.fortLevel >= FORT.MAX_LEVEL) return nextState;
  if (tile.busyUntil !== null && tile.busyUntil > nextState.now) return nextState;
  if (player.gold < FORT.GOLD_COST_PER_LEVEL) return nextState;

  player.gold -= FORT.GOLD_COST_PER_LEVEL;
  tile.fortLevel = incrementFortLevel(tile.fortLevel);
  tile.busyUntil = nextState.now + FORT.BUILD_SECONDS_PER_LEVEL;

  return nextState;
}

// Arms the garrison of an owned tile. Instant — no busy period.
// The armour buff travels with troops when they are dispatched.
export function applyArmour(params: {
  state: GameState;
  playerId: PlayerId;
  tileId: string;
}): GameState {
  const nextState = cloneGameState(params.state);
  const tile = nextState.tiles[params.tileId];
  const player = nextState.players[params.playerId];

  if (!tile || tile.owner !== params.playerId) return nextState;
  if (!player) return nextState;
  if (tile.armoured) return nextState;
  if (player.gold < ARMOUR.GOLD_COST) return nextState;

  player.gold -= ARMOUR.GOLD_COST;
  tile.armoured = true;

  return nextState;
}

// Creates a chained reinforce action that passes troops through multiple
// player-owned tiles in sequence. `path` must be at least 2 tile IDs long:
// [source, ...intermediates, destination]. Each leg is a land_reinforce;
// troops pass through intermediate tiles without depositing there. The chain
// breaks gracefully if an intermediate tile is captured mid-transit.
export function createChainedReinforceAction(params: {
  state: GameState;
  playerId: PlayerId;
  path: string[];       // full path from source to destination, inclusive
  troopsSent: number;
  sendFraction?: number; // fraction to re-apply at each intermediate hop
}): GameState {
  if (params.path.length < 2) return params.state;

  const [sourceTileId, targetTileId, ...rest] = params.path;
  if (!sourceTileId || !targetTileId) return params.state;

  return createLandAction({
    state: params.state,
    playerId: params.playerId,
    sourceTileId,
    targetTileId,
    troopsSent: params.troopsSent,
    ...(rest.length > 0 ? { remainingPath: rest } : {}),
    ...(params.sendFraction !== undefined ? { sendFraction: params.sendFraction } : {}),
  });
}

// Convenience function used by the player input handler.
// Automatically picks sea movement if a sea lane connects source to target,
// otherwise falls back to a land action.
export function createBestAvailableAction(params: {
  state: GameState;
  playerId: PlayerId;
  sourceTileId: string;
  targetTileId: string;
  troopsSent?: number;
}): GameState {
  const sourceDefinition = params.state.tileDefinitions[params.sourceTileId];
  const targetDefinition = params.state.tileDefinitions[params.targetTileId];

  if (!sourceDefinition || !targetDefinition) {
    return params.state;
  }

  const seaLane = findSeaLaneBetween(
    params.state.seaLanes,
    params.sourceTileId,
    params.targetTileId
  );

  if (sourceDefinition.coastal && targetDefinition.coastal && seaLane) {
    return createSeaAction(params);
  }

  return createLandAction(params);
}
