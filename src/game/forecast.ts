/**
 * forecast.ts — Attack outcome prediction from public information.
 *
 * Shared by the hard AI (attack sizing) and the HUD (win-chance badge while
 * dragging), so the odds shown to the player are exactly the odds the AI
 * plans with. Everything here reads only what any player can see on screen:
 * garrisons, modifiers, production rates, and in-flight actions.
 */

import { estimateCombatOutcome } from "./combat";
import { NEUTRAL_MAX_TROOPS, PRODUCTION_CAPS } from "./constants";
import {
  calculateLandAttackTime,
  calculateSeaAttackTime,
  findSeaLaneBetween,
} from "./movement";
import { getProductionCapKey, getProductionRate } from "./simulation";
import type { GameState, TileDefinition, TileState } from "./types";

/**
 * Projects the defender's garrison at the moment an attack launched now would
 * arrive: current troops + production during travel + friendly reinforcements
 * already in flight that land first. Capped at the tile's production ceiling.
 */
export function projectDefenderTroopsAtArrival(
  state: GameState,
  target: TileState,
  targetDef: TileDefinition,
  travelSeconds: number
): number {
  const rate = getProductionRate({
    terrain: targetDef.terrain,
    isCapital: targetDef.isCapital,
    owner: target.owner,
  });

  let troops = target.troops + rate * travelSeconds;

  for (const action of state.activeActions) {
    if (action.targetTileId !== target.id) continue;
    if (action.owner !== target.owner) continue;
    if (action.type !== "land_reinforce" && action.type !== "sea_move") continue;
    if (action.resolvesAt > state.now + travelSeconds) continue;
    troops += action.troopsSent;
  }

  // Production stops at the cap; never project above it (but a garrison
  // already over cap stays where it is — decay is slow enough to ignore).
  const capKey = getProductionCapKey({
    terrain: targetDef.terrain,
    isCapital: targetDef.isCapital,
  });
  const cap = target.owner === "neutral" ? NEUTRAL_MAX_TROOPS : PRODUCTION_CAPS[capKey].stopsAt;
  return Math.min(troops, Math.max(target.troops, cap));
}

export interface AttackForecast {
  /** P(attacker captures the tile), over the combat random factor. */
  winProbability: number;
  /** Defender troops projected at the attack's arrival time. */
  projectedDefenders: number;
  /** True when the attack would route via a sea lane. */
  isSea: boolean;
}

/**
 * Forecasts an attack from one tile to another with a given force. Routing
 * mirrors createBestAvailableAction: coastal tiles joined by a sea lane fight
 * by sea (amphibious defence bonus, longer travel), otherwise by land.
 * Returns null if either tile is unknown.
 */
export function forecastAttack(params: {
  state: GameState;
  sourceTileId: string;
  targetTileId: string;
  troopsSent: number;
}): AttackForecast | null {
  const source = params.state.tiles[params.sourceTileId];
  const target = params.state.tiles[params.targetTileId];
  const sourceDef = params.state.tileDefinitions[params.sourceTileId];
  const targetDef = params.state.tileDefinitions[params.targetTileId];
  if (!source || !target || !sourceDef || !targetDef) return null;

  const lane =
    sourceDef.coastal && targetDef.coastal
      ? findSeaLaneBetween(params.state.seaLanes, params.sourceTileId, params.targetTileId)
      : null;
  const isSea = lane !== null;

  const travelSeconds = isSea
    ? calculateSeaAttackTime(lane.distance, 0, source.attackVetLevel, target.fortLevel)
    : calculateLandAttackTime(
        sourceDef,
        targetDef,
        params.troopsSent,
        0,
        source.attackVetLevel,
        target.fortLevel
      );

  const projectedDefenders = Math.floor(
    projectDefenderTroopsAtArrival(params.state, target, targetDef, travelSeconds)
  );

  const winProbability = estimateCombatOutcome({
    attackerTroops: params.troopsSent,
    defenderTroops: projectedDefenders,
    defenderTerrain: targetDef.terrain,
    defenderIsCapital: targetDef.isCapital,
    isSeaAttack: isSea,
    attackerArmoured: source.armoured,
    attackerAttackVetLevel: source.attackVetLevel,
    defenderArmoured: target.armoured,
    defenderFortLevel: target.fortLevel,
    defenderDefVetLevel: target.defVetLevel,
  }).winProbability;

  return { winProbability, projectedDefenders, isSea };
}
