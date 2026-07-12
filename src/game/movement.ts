/**
 * movement.ts — Travel-time formulas, sea cost, and move validation.
 *
 * All timing functions return a duration in seconds. The caller adds that
 * duration to `state.now` to get `resolvesAt` for the new ActiveAction.
 *
 * Validation functions return a MoveValidationResult rather than throwing so
 * callers (player input and the AI) can inspect the reason without try/catch.
 */

import {
  FORT,
  MOVEMENT,
  SEA,
  TERRAIN_MOVEMENT_MULTIPLIER,
  VETERAN,
} from "./constants";
import { areAllies, isPlayer } from "./state";
import type {
  GameState,
  MoveValidationResult,
  PlayerId,
  SeaCostResult,
  SeaLane,
  TileDefinition,
  TileState,
  VetLevel,
} from "./types";

// Movement through difficult terrain uses the SLOWEST terrain between source
// and target - entering a mountain is just as slow as leaving one.
function getSlowestTerrainMultiplier(
  source: TileDefinition,
  target: TileDefinition
): number {
  return Math.max(
    TERRAIN_MOVEMENT_MULTIPLIER[source.terrain],
    TERRAIN_MOVEMENT_MULTIPLIER[target.terrain]
  );
}

// Large troop stacks move slower. The first 10 troops are "free" then
// each extra troop adds a small delay multiplier.
export function calculateTroopLoadMultiplier(troopsSent: number): number {
  return (
    1 +
    MOVEMENT.TROOP_LOAD_MULTIPLIER_PER_EXTRA_TROOP *
      Math.max(0, troopsSent - MOVEMENT.TROOP_LOAD_FREE_AMOUNT)
  );
}

/**
 * Duration in seconds for a friendly land reinforcement.
 * Slower terrain and larger stacks both increase the time.
 */
export function calculateLandMoveTime(
  source: TileDefinition,
  target: TileDefinition,
  troopsSent: number
): number {
  return (
    MOVEMENT.LAND_REINFORCE_BASE_SECONDS *
    getSlowestTerrainMultiplier(source, target) *
    calculateTroopLoadMultiplier(troopsSent)
  );
}

// Land attacks take slightly longer than reinforcing because the troops
// need to organise into an assault formation before engaging.
// Attack veterans move faster; fortified defenders slow the approach.
export function calculateLandAttackTime(
  source: TileDefinition,
  target: TileDefinition,
  troopsSent: number,
  combatResolutionTime: number,
  attackerAttackVetLevel: VetLevel = 0,
  defenderFortLevel: number = 0
): number {
  const vetSpeedMultiplier = 1 - VETERAN.ATTACK_SPEED_BONUS_PER_LEVEL * attackerAttackVetLevel;
  const fortDelayMultiplier = 1 + FORT.LAND_ATTACK_DELAY_PER_LEVEL * defenderFortLevel;
  return (
    MOVEMENT.LAND_ATTACK_BASE_SECONDS *
      getSlowestTerrainMultiplier(source, target) *
      calculateTroopLoadMultiplier(troopsSent) *
      vetSpeedMultiplier *
      fortDelayMultiplier +
    combatResolutionTime
  );
}

// Sea travel time grows with distance but uses sqrt to soften the curve -
// longer lanes are proportionally faster once you factor in the fixed overhead.
export function calculateSeaTravelTime(distance: number): number {
  return (
    SEA.TRAVEL_TIME_DISTANCE_MULTIPLIER * distance +
    SEA.TRAVEL_TIME_SQRT_DISTANCE_MULTIPLIER * Math.sqrt(distance)
  );
}

// Disembarking always takes a minimum amount of time regardless of distance,
// plus a small log2 penalty for longer voyages (troops need more time to
// organise after a long journey).
export function calculateDisembarkDelay(distance: number): number {
  return (
    SEA.DISEMBARK_BASE_SECONDS +
    SEA.DISEMBARK_LOG2_DISTANCE_MULTIPLIER * Math.log2(distance + 1)
  );
}

/** Total duration in seconds for a friendly sea reinforcement (travel + disembark). */
export function calculateSeaMoveTime(laneDistance: number): number {
  return (
    calculateSeaTravelTime(laneDistance) +
    calculateDisembarkDelay(laneDistance)
  );
}

/**
 * Total duration in seconds for a sea attack: travel + disembark (with vet/fort
 * modifiers) plus the combat resolution phase (scaled by SEA.COMBAT_TIME_MULTIPLIER
 * because amphibious assaults are messier than land engagements).
 */
export function calculateSeaAttackTime(
  laneDistance: number,
  combatResolutionTime: number,
  attackerAttackVetLevel: VetLevel = 0,
  defenderFortLevel: number = 0
): number {
  const vetSpeedMultiplier = 1 - VETERAN.ATTACK_SPEED_BONUS_PER_LEVEL * attackerAttackVetLevel;
  const fortDelayMultiplier = 1 + FORT.SEA_ATTACK_DELAY_PER_LEVEL * defenderFortLevel;
  return (
    (calculateSeaTravelTime(laneDistance) + calculateDisembarkDelay(laneDistance)) *
      vetSpeedMultiplier *
      fortDelayMultiplier +
    SEA.COMBAT_TIME_MULTIPLIER * combatResolutionTime
  );
}

// Returns every tile reachable from `tileId` by sea: the far end of each lane
// that starts here, plus the near end of bidirectional lanes that end here.
export function getSeaNeighbors(seaLanes: SeaLane[], tileId: string): string[] {
  const neighbors: string[] = [];
  for (const lane of seaLanes) {
    if (lane.from === tileId) neighbors.push(lane.to);
    else if (lane.bidirectional && lane.to === tileId) neighbors.push(lane.from);
  }
  return neighbors;
}

// Looks up the sea lane connecting two tiles. Returns null if no such lane exists.
// The bidirectional check means we only need to store each lane once in the data.
export function findSeaLaneBetween(
  seaLanes: SeaLane[],
  sourceTileId: string,
  targetTileId: string
): SeaLane | null {
  return (
    seaLanes.find((lane) => {
      if (lane.from === sourceTileId && lane.to === targetTileId) {
        return true;
      }

      if (
        lane.bidirectional &&
        lane.from === targetTileId &&
        lane.to === sourceTileId
      ) {
        return true;
      }

      return false;
    }) ?? null // the ?? operator returns the right side if the left is null/undefined
  );
}

// Calculates the gold cost of a sea movement. Coastal towns and capitals
// receive a discount; free small town-to-town reinforcement is handled first.
export function calculateSeaCost(params: {
  troopsSent: number;
  sourceDefinition: TileDefinition;
  sourceState: TileState;
  targetDefinition: TileDefinition;
  targetState: TileState;
}): SeaCostResult {
  const effectiveWeight = params.troopsSent;
  const baseCost = Math.ceil(effectiveWeight / SEA.COST_PER_EFFECTIVE_WEIGHT);

  const originIsTownOrCapital =
    params.sourceDefinition.isTown || params.sourceDefinition.isCapital;

  const destinationIsTownOrCapital =
    params.targetDefinition.isTown || params.targetDefinition.isCapital;

  const samePlayerOwnsBoth =
    isPlayer(params.sourceState.owner) &&
    params.targetState.owner === params.sourceState.owner;

  // Small reinforcements between two friendly towns or capitals are free.
  // This encourages using the sea for logistics without making it dominant.
  const freeTownToTown =
    originIsTownOrCapital &&
    destinationIsTownOrCapital &&
    samePlayerOwnsBoth &&
    effectiveWeight <= SEA.FREE_TOWN_TO_TOWN_MAX_EFFECTIVE_WEIGHT;

  if (freeTownToTown) {
    return {
      cost: 0,
      effectiveWeight,
      baseCost,
      discounted: true,
      freeTownToTown: true,
    };
  }

  const discountedCost = originIsTownOrCapital
    ? Math.ceil(baseCost / 2)
    : baseCost;

  return {
    cost: Math.min(discountedCost, SEA.MAX_SEA_COST),
    effectiveWeight,
    baseCost,
    discounted: originIsTownOrCapital,
    freeTownToTown: false,
  };
}

/**
 * How long the source tile must wait before it can launch another sea action.
 * Towns and capitals have a shorter cooldown because they are purpose-built ports.
 */
export function calculateEmbarkCooldownSeconds(
  sourceDefinition: TileDefinition
): number {
  if (sourceDefinition.isTown || sourceDefinition.isCapital) {
    return SEA.EMBARK_COOLDOWN_TOWN_OR_CAPITAL_SECONDS;
  }

  return SEA.EMBARK_COOLDOWN_OTHER_COAST_SECONDS;
}

// A sea attack only busy-locks the defender if the attacking force is large
// enough relative to the garrison. Small raids harass but don't pin the defender.
export function shouldSeaAttackBusyLockDefender(
  attackingForce: number,
  defendingForce: number
): boolean {
  return (
    attackingForce >=
    SEA.BUSY_LOCK_ATTACKER_TO_DEFENDER_RATIO * defendingForce
  );
}

// Capitals require an even stronger force to capture from the sea.
export function canSeaAttackCaptureCapital(
  attackingForce: number,
  defendingForce: number
): boolean {
  return (
    attackingForce >=
    SEA.CAPITAL_CAPTURE_ATTACKER_TO_DEFENDER_RATIO * defendingForce
  );
}

// Validation functions return a result object rather than throwing, so the
// caller (player input handler or AI) can inspect the reason without try/catch.
export function validateLandAction(params: {
  state: GameState;
  playerId: PlayerId;
  sourceTileId: string;
  targetTileId: string;
  troopsSent: number;
}): MoveValidationResult {
  const source = params.state.tiles[params.sourceTileId];
  const target = params.state.tiles[params.targetTileId];
  const sourceDefinition = params.state.tileDefinitions[params.sourceTileId];

  if (!source || !target || !sourceDefinition) {
    return { valid: false, reason: "Unknown source or target tile." };
  }

  if (source.owner !== params.playerId) {
    return { valid: false, reason: "Source tile is not owned by player." };
  }

  if (!sourceDefinition.adjacent.includes(params.targetTileId)) {
    return { valid: false, reason: "Target tile is not adjacent." };
  }

  if (params.troopsSent <= 0) {
    return { valid: false, reason: "Troops sent must be greater than zero." };
  }

  // Must leave at least one troop behind so the tile stays owned.
  if (params.troopsSent >= source.troops) {
    return { valid: false, reason: "Must leave at least one troop behind." };
  }

  if (source.busyUntil !== null && source.busyUntil > params.state.now) {
    return { valid: false, reason: "Source tile is busy." };
  }

  // In team modes a teammate's tile is neither a valid attack target nor a
  // valid reinforce destination — keeps the simple ownership model intact.
  // Mechanics-rich team cooperation is intentionally deferred to a later
  // pass; this rule prevents accidental friendly-fire and confusion.
  if (
    target.owner !== params.playerId &&
    areAllies(params.state, target.owner, params.playerId)
  ) {
    return { valid: false, reason: "Cannot target a teammate's tile." };
  }

  return { valid: true };
}

export function validateSeaAction(params: {
  state: GameState;
  playerId: PlayerId;
  sourceTileId: string;
  targetTileId: string;
  troopsSent: number;
}): MoveValidationResult {
  const source = params.state.tiles[params.sourceTileId];
  const target = params.state.tiles[params.targetTileId];
  const sourceDefinition = params.state.tileDefinitions[params.sourceTileId];
  const targetDefinition = params.state.tileDefinitions[params.targetTileId];

  if (!source || !target || !sourceDefinition || !targetDefinition) {
    return { valid: false, reason: "Unknown source or target tile." };
  }

  if (source.owner !== params.playerId) {
    return { valid: false, reason: "Source tile is not owned by player." };
  }

  if (!sourceDefinition.coastal || !targetDefinition.coastal) {
    return { valid: false, reason: "Sea movement requires coastal tiles." };
  }

  const seaLane = findSeaLaneBetween(
    params.state.seaLanes,
    params.sourceTileId,
    params.targetTileId
  );

  if (!seaLane) {
    return { valid: false, reason: "No sea lane connects these tiles." };
  }

  if (params.troopsSent <= 0) {
    return { valid: false, reason: "Troops sent must be greater than zero." };
  }

  if (params.troopsSent >= source.troops) {
    return { valid: false, reason: "Must leave at least one troop behind." };
  }

  if (
    source.embarkCooldownUntil !== null &&
    source.embarkCooldownUntil > params.state.now
  ) {
    return { valid: false, reason: "Source tile is on embark cooldown." };
  }

  if (!isPlayer(source.owner)) {
    return { valid: false, reason: "Neutral source cannot launch sea action." };
  }

  // Sea travel into a teammate's tile is also disallowed (see validateLandAction).
  if (
    target.owner !== params.playerId &&
    areAllies(params.state, target.owner, params.playerId)
  ) {
    return { valid: false, reason: "Cannot target a teammate's tile." };
  }

  const seaCost = calculateSeaCost({
    troopsSent: params.troopsSent,
    sourceDefinition,
    sourceState: source,
    targetDefinition,
    targetState: target,
  });

  const player = params.state.players[params.playerId];

  if (!player) {
    return { valid: false, reason: "Player is not active in this match." };
  }

  if (player.gold < seaCost.cost) {
    return { valid: false, reason: "Not enough gold for sea action." };
  }

  return { valid: true };
}
