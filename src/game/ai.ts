/**
 * ai.ts — The computer opponent's decision-making loop.
 *
 * updateAI() is called every tick. It does nothing until
 * `state.now >= state.ai.nextThinkAt`, then runs ALL non-human players through
 * one full think cycle before resetting the shared timer. This guarantees that
 * players 3 and 4 are never skipped by a timer reset that fires right after
 * player 2 acts. Per-player logic lives in the private runAIForPlayer():
 *
 *  1. Chooses a stance (defensive / balanced / aggressive) based on power ratio
 *     and territory share.
 *  2. Hard: tries a coordinated multi-source attack first if one is feasible.
 *  3. Runs a greedy single-source loop, scoring every candidate action and
 *     picking the best until the action budget for this difficulty is exhausted.
 *  4. Spends leftover gold on fortifications and armour.
 *
 * Difficulty levels differ in think speed, action budget, target-selection
 * precision, and occasional deliberate mistakes on Easy.
 */

import { applyArmour, buildFortification, createLandAction, createSeaAction } from "./actions";
import { AI, ARMOUR, FORT } from "./constants";
import { validateLandAction, validateSeaAction } from "./movement";
import { cloneGameState, getOpponents, isPlayer } from "./state";
import type {
  AIStance,
  Difficulty,
  GameState,
  OwnerId,
  PlayerId,
  TileDefinition,
  TileState,
} from "./types";

// A scored single-source candidate. The greedy picker chooses among these.
interface CandidateAction {
  sourceTileId: string;
  targetTileId: string;
  troopsSent: number;
  score: number;
  useSea: boolean;
  kind: "attack" | "reinforce_defend" | "reinforce_pressure";
}

// A coordinated multi-source plan used only by Hard difficulty. Several
// owned tiles attack the same target on the same think tick so their combined
// force overwhelms a defender that none of them could beat alone.
interface CombinedAttackPlan {
  targetTileId: string;
  sources: { sourceTileId: string; troopsSent: number }[];
  score: number;
}

// One entry per owned tile that's in danger of being captured this turn.
// Urgency = attacking mass × how badly we'd miss the tile if lost.
interface TileThreat {
  tileId: string;
  threatLevel: number;
  vulnerability: number;
  urgency: number;
}

// ── Basic helpers ───────────────────────────────────────────────────────────

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function getThinkDelaySeconds(difficulty: Difficulty): number {
  if (difficulty === "easy") {
    return randomBetween(AI.EASY_THINK_MIN_SECONDS, AI.EASY_THINK_MAX_SECONDS);
  }
  if (difficulty === "hard") {
    return randomBetween(AI.HARD_THINK_MIN_SECONDS, AI.HARD_THINK_MAX_SECONDS);
  }
  return randomBetween(AI.NORMAL_THINK_MIN_SECONDS, AI.NORMAL_THINK_MAX_SECONDS);
}

function getMaxActionsPerThink(difficulty: Difficulty): number {
  if (difficulty === "easy") return AI.EASY_MAX_ACTIONS_PER_THINK;
  if (difficulty === "hard") return AI.HARD_MAX_ACTIONS_PER_THINK;
  return AI.NORMAL_MAX_ACTIONS_PER_THINK;
}

function getPlayerTiles(state: GameState, playerId: PlayerId): TileState[] {
  return Object.values(state.tiles).filter((tile) => tile.owner === playerId);
}

// Returns the set of opponent player ids — i.e. active players on a different
// team. Cached locally per call site since callers usually compare many tiles
// against the same opponent list.
function getOpponentIds(state: GameState, playerId: PlayerId): Set<PlayerId> {
  return new Set(getOpponents(state, playerId));
}

// True if `owner` is an enemy player (a real player, not neutral, not on
// our team). Neutrals are not enemies but are still attack targets — callers
// that want "anything I can attack" should combine this with an explicit
// neutral check.
function isEnemyOwner(
  opponents: Set<PlayerId>,
  owner: OwnerId
): boolean {
  return isPlayer(owner) && opponents.has(owner);
}

function getEnemyTiles(state: GameState, playerId: PlayerId): TileState[] {
  const opponents = getOpponentIds(state, playerId);
  return Object.values(state.tiles).filter((tile) =>
    isEnemyOwner(opponents, tile.owner)
  );
}

function getTotalTroops(state: GameState, owner: OwnerId): number {
  return Object.values(state.tiles)
    .filter((tile) => tile.owner === owner)
    .reduce((sum, tile) => sum + tile.troops, 0);
}

function isTileBusy(state: GameState, tile: TileState): boolean {
  return tile.busyUntil !== null && tile.busyUntil > state.now;
}

function getTerritoryShare(state: GameState, playerId: PlayerId): number {
  // Neutral tiles aren't contested yet, so excluding them gives a clearer
  // read of how much of the *claimed* map the AI controls.
  const contested = Object.values(state.tiles).filter((tile) => isPlayer(tile.owner));
  const owned = contested.filter((tile) => tile.owner === playerId);
  if (contested.length === 0) return 0;
  return owned.length / contested.length;
}

// Power ratio is AI troops vs the total troops of every opposing player
// combined. In team modes this means an AI on the losing team will read its
// position as worse than its own troop count would suggest — which is the
// right behaviour: it should react to the whole enemy alliance, not just
// the single nearest player.
function getPowerRatio(state: GameState, playerId: PlayerId): number {
  const opponents = getOpponentIds(state, playerId);
  const aiTroops = getTotalTroops(state, playerId);
  let enemyTroops = 0;
  for (const enemyId of opponents) enemyTroops += getTotalTroops(state, enemyId);
  return aiTroops / Math.max(1, enemyTroops);
}

// All capitals owned by an opponent player. Used both for distance-to-target
// BFS and to test whether our own capital is encircled.
function getOpponentCapitalTiles(
  state: GameState,
  playerId: PlayerId
): TileState[] {
  const opponents = getOpponentIds(state, playerId);
  const result: TileState[] = [];
  for (const def of Object.values(state.tileDefinitions)) {
    const tile = state.tiles[def.id];
    if (def.isCapital && tile && isEnemyOwner(opponents, tile.owner)) {
      result.push(tile);
    }
  }
  return result;
}

function getOwnCapitalTile(
  state: GameState,
  playerId: PlayerId
): TileState | null {
  const def = Object.values(state.tileDefinitions).find((d) => {
    const tile = state.tiles[d.id];
    return d.isCapital && tile?.owner === playerId;
  });
  return def ? state.tiles[def.id] ?? null : null;
}

function isCapitalThreatened(state: GameState, playerId: PlayerId): boolean {
  const capital = getOwnCapitalTile(state, playerId);
  if (!capital) return true; // already lost — treat as threatened
  const capitalDef = state.tileDefinitions[capital.id];
  if (!capitalDef) return false;
  const opponents = getOpponentIds(state, playerId);
  return capitalDef.adjacent.some((adjId) => {
    const adj = state.tiles[adjId];
    return adj !== undefined && isEnemyOwner(opponents, adj.owner);
  });
}

function enemyCloseToElimination(state: GameState, playerId: PlayerId): boolean {
  return getEnemyTiles(state, playerId).length <= 3;
}

// Count of non-owned (enemy or neutral) neighbours. A high score means the
// tile is positioned to launch attacks; a zero means it's fully interior.
// Used to prevent reinforcement ping-pong between two equally-exposed tiles.
function getFrontlineExposure(
  state: GameState,
  tileId: string,
  playerId: PlayerId
): number {
  const def = state.tileDefinitions[tileId];
  if (!def) return 0;
  let count = 0;
  for (const adjId of def.adjacent) {
    const adj = state.tiles[adjId];
    if (adj && adj.owner !== playerId) count += 1;
  }
  return count;
}

// ── BFS distance from every tile to the nearest opponent capital ───────────

// Used by Hard to bias attacks toward tiles that actually advance the front
// line toward an enemy capital. Multi-source BFS — every opponent capital
// is seeded at distance 0, so each tile's value is the distance to whichever
// enemy capital is closest. In FFA modes this naturally focuses pressure on
// the nearest of multiple enemies. Cheap on a 19-tile map — recompute per think.
function computeDistancesToOpponentCapital(
  state: GameState,
  playerId: PlayerId
): Map<string, number> {
  const distances = new Map<string, number>();
  const capitals = getOpponentCapitalTiles(state, playerId);
  if (capitals.length === 0) return distances;

  const queue: string[] = [];
  for (const capital of capitals) {
    distances.set(capital.id, 0);
    queue.push(capital.id);
  }

  while (queue.length > 0) {
    const currentId = queue.shift() as string;
    const currentDist = distances.get(currentId) as number;
    const def = state.tileDefinitions[currentId];
    if (!def) continue;

    for (const adjId of def.adjacent) {
      if (distances.has(adjId)) continue;
      distances.set(adjId, currentDist + 1);
      queue.push(adjId);
    }
  }

  return distances;
}

// ── Stance ──────────────────────────────────────────────────────────────────

function chooseAIStance(
  state: GameState,
  playerId: PlayerId,
  currentStance: AIStance
): AIStance {
  const powerRatio = getPowerRatio(state, playerId);
  const territoryShare = getTerritoryShare(state, playerId);

  if (enemyCloseToElimination(state, playerId)) return "aggressive";
  if (isCapitalThreatened(state, playerId)) return "defensive";
  if (state.now < AI.EARLY_GAME_AGGRESSIVE_SECONDS) return "aggressive";

  const stanceCanChange =
    state.now - state.ai.stanceChangedAt >= AI.MIN_STANCE_DURATION_SECONDS;
  if (!stanceCanChange) return currentStance;

  if (powerRatio < AI.POWER_RATIO_DEFENSIVE_THRESHOLD) return "defensive";
  if (
    powerRatio > AI.POWER_RATIO_AGGRESSIVE_THRESHOLD ||
    territoryShare > AI.TERRITORY_SHARE_AGGRESSIVE_THRESHOLD
  ) {
    return "aggressive";
  }
  return "balanced";
}

// ── Threat assessment (defensive) ───────────────────────────────────────────

// Capitals dominate; towns and bridges matter; plain frontier tiles are cheap.
function getTileVulnerabilityValue(definition: TileDefinition): number {
  if (definition.isCapital) return 100;
  if (definition.isTown) return 35;
  if (definition.hasBridge) return 25;
  return 10;
}

// Sums adjacent enemy troop mass against each of the AI's tiles. Anything
// where the attacker mass approaches the defender's effective garrison
// (troops + a small fort bonus) is flagged. Busy enemy tiles are ignored —
// they can't launch a new attack this think.
function assessOwnTileThreats(
  state: GameState,
  playerId: PlayerId
): TileThreat[] {
  const opponents = getOpponentIds(state, playerId);
  const threats: TileThreat[] = [];

  for (const tile of getPlayerTiles(state, playerId)) {
    const def = state.tileDefinitions[tile.id];
    if (!def) continue;

    let threatLevel = 0;
    for (const adjId of def.adjacent) {
      const adj = state.tiles[adjId];
      if (
        adj !== undefined &&
        isEnemyOwner(opponents, adj.owner) &&
        !isTileBusy(state, adj)
      ) {
        threatLevel += adj.troops;
      }
    }

    if (threatLevel <= 0) continue;

    const defenderMass = tile.troops + tile.fortLevel * 2;
    if (threatLevel < defenderMass * AI.THREAT_RATIO_FLOOR) continue;

    const vulnerability = getTileVulnerabilityValue(def);
    threats.push({
      tileId: tile.id,
      threatLevel,
      vulnerability,
      urgency: threatLevel * vulnerability,
    });
  }

  threats.sort((a, b) => b.urgency - a.urgency);
  return threats;
}

// ── Target scoring (offensive) ──────────────────────────────────────────────

function getTargetBaseValue(
  state: GameState,
  definition: TileDefinition,
  tile: TileState,
  playerId: PlayerId
): number {
  const opponents = getOpponentIds(state, playerId);
  const ownerIsEnemy = isEnemyOwner(opponents, tile.owner);
  if (definition.isCapital && ownerIsEnemy) return 120;
  if (definition.isTown) return 70;
  if (definition.hasBridge) return 50;
  if (ownerIsEnemy && definition.terrain === "plains") return 45;
  if (tile.owner === "neutral" && definition.terrain === "plains") return 30;
  if (definition.terrain === "forest") return 22;
  if (definition.terrain === "mountain") return 12;
  return 18;
}

// A coarse win-probability proxy. Real combat factors in fort, vet, terrain —
// this is enough to keep the AI from launching obviously losing attacks.
function estimateWinChance(attackerTroops: number, defenderTroops: number): number {
  if (defenderTroops <= 0) return 1;
  return attackerTroops / Math.max(1, attackerTroops + defenderTroops);
}

// Easy keeps a flat 65%-of-source rule so its behaviour stays predictable.
// Normal/Hard size attacks by defender strength so they don't overcommit on
// soft targets or undercommit on hard ones.
function computeTroopsToSend(
  source: TileState,
  target: TileState,
  isAttack: boolean,
  difficulty: Difficulty,
  stance: AIStance
): number {
  if (!isAttack) {
    const fraction = stance === "defensive" ? 0.55 : 0.45;
    return Math.max(1, Math.floor(source.troops * fraction));
  }

  if (difficulty === "easy") {
    return Math.max(1, Math.floor(source.troops * 0.65));
  }

  const needed =
    Math.ceil(target.troops * AI.ATTACK_TARGET_MULTIPLIER) + AI.ATTACK_CUSHION;
  const maxAvailable = source.troops - AI.ATTACK_MIN_GARRISON_LEFT;
  if (maxAvailable < 1) return Math.max(1, source.troops - 1);

  // Send what's needed, but never less than ~half the garrison if available —
  // sending tiny forces telegraphs the attack and rarely accomplishes much.
  const minSend = Math.floor(source.troops * 0.5);
  return Math.min(maxAvailable, Math.max(needed, minSend));
}

function scoreLandAttack(params: {
  state: GameState;
  playerId: PlayerId;
  stance: AIStance;
  source: TileState;
  target: TileState;
  difficulty: Difficulty;
  capitalDistances: Map<string, number>;
}): CandidateAction | null {
  const targetDef = params.state.tileDefinitions[params.target.id];
  if (!targetDef) return null;

  const minTroops =
    params.difficulty === "easy" ? 7 : AI.MIN_TROOPS_TO_ATTACK_NORMAL;
  if (params.source.troops < minTroops) return null;

  const troopsSent = computeTroopsToSend(
    params.source,
    params.target,
    true,
    params.difficulty,
    params.stance
  );

  const validation = validateLandAction({
    state: params.state,
    playerId: params.playerId,
    sourceTileId: params.source.id,
    targetTileId: params.target.id,
    troopsSent,
  });
  if (!validation.valid) return null;

  const winChance = estimateWinChance(troopsSent, params.target.troops);

  // Win-chance floors keep Normal/Hard from throwing coin-flip attacks at
  // garbage targets, while still letting them gamble on capitals and towns
  // where the prize is worth the risk.
  const isHighValue =
    targetDef.isCapital || targetDef.isTown || targetDef.hasBridge;
  const winFloor = isHighValue
    ? 0.45
    : params.difficulty === "easy"
      ? 0.35
      : 0.55;
  if (winChance < winFloor) return null;

  const opponents = getOpponentIds(params.state, params.playerId);
  const targetOwnerIsEnemy = isEnemyOwner(opponents, params.target.owner);

  let score = getTargetBaseValue(
    params.state,
    targetDef,
    params.target,
    params.playerId
  );
  score += winChance * 50;

  // Tempo: a busy defender can't shore up its garrison this think.
  if (isTileBusy(params.state, params.target)) {
    score += AI.BUSY_TARGET_BONUS;
  }

  if (params.difficulty === "hard") {
    const dist = params.capitalDistances.get(params.target.id);
    if (dist !== undefined) {
      const pathBonus = Math.max(
        0,
        AI.CAPITAL_PATH_BONUS_BASE - dist * AI.CAPITAL_PATH_BONUS_FALLOFF
      );
      score += pathBonus;
    }

    // Encirclement: prefer to clear neighbours of an enemy capital before
    // assaulting the capital itself. Any opponent capital counts — in FFA
    // modes this still rewards trimming whichever enemy is most exposed.
    const adjToOppCapital = targetDef.adjacent.some((id) => {
      const tile = params.state.tiles[id];
      const def = params.state.tileDefinitions[id];
      return (
        def?.isCapital === true &&
        tile !== undefined &&
        isEnemyOwner(opponents, tile.owner)
      );
    });
    if (adjToOppCapital && !targetDef.isCapital) {
      score += AI.ENCIRCLE_BONUS;
    }
  }

  // Stance adjustments.
  if (params.stance === "defensive") {
    if (targetDef.isCapital || targetDef.isTown) score += 25;
    if (winChance < 0.6) score -= 25;
  } else if (params.stance === "balanced") {
    score += 15;
  } else if (params.stance === "aggressive") {
    score += 25;
    if (targetOwnerIsEnemy) score += 20;
    if (targetDef.isCapital) score += 35;
  }

  if (params.source.troops - troopsSent < 2) score -= 25;

  // Easy: occasional overvaluation of neutrals — keeps it from playing
  // perfectly even within its limited framework.
  if (
    params.difficulty === "easy" &&
    params.target.owner === "neutral" &&
    Math.random() < AI.EASY_OVERVALUE_NEUTRALS_CHANCE
  ) {
    score += 30;
  }

  return {
    sourceTileId: params.source.id,
    targetTileId: params.target.id,
    troopsSent,
    score,
    useSea: false,
    kind: "attack",
  };
}

function scoreLandReinforce(params: {
  state: GameState;
  playerId: PlayerId;
  stance: AIStance;
  source: TileState;
  target: TileState;
  difficulty: Difficulty;
  threatByTile: Map<string, TileThreat>;
}): CandidateAction | null {
  const targetDef = params.state.tileDefinitions[params.target.id];
  if (!targetDef) return null;
  if (params.target.owner !== params.playerId) return null;

  // Skip "interior" reinforcement — shuffling troops between two safe tiles
  // wastes a think slot. A tile is worth reinforcing only if it borders an
  // enemy (real combat) or neutrals (forward staging for expansion). Teammate
  // adjacencies don't count as "front line".
  const opponents = getOpponentIds(params.state, params.playerId);
  let touchesEnemy = false;
  let touchesNeutral = false;
  for (const adjId of targetDef.adjacent) {
    const adj = params.state.tiles[adjId];
    if (!adj) continue;
    if (isEnemyOwner(opponents, adj.owner)) touchesEnemy = true;
    else if (adj.owner === "neutral") touchesNeutral = true;
  }
  if (!touchesEnemy && !touchesNeutral) return null;

  const troopsSent = computeTroopsToSend(
    params.source,
    params.target,
    false,
    params.difficulty,
    params.stance
  );
  if (params.source.troops - troopsSent < 2) return null;

  const validation = validateLandAction({
    state: params.state,
    playerId: params.playerId,
    sourceTileId: params.source.id,
    targetTileId: params.target.id,
    troopsSent,
  });
  if (!validation.valid) return null;

  let score = 10;
  const threat = params.threatByTile.get(params.target.id);

  if (threat) {
    // Threat-driven reinforcement is high priority and bypasses the exposure
    // check below — a tile actively under attack needs help from anywhere.
    score += AI.THREAT_REINFORCE_BONUS;
    if (targetDef.isCapital) score += 80;
    else if (targetDef.isTown) score += 30;
    score += Math.min(40, threat.threatLevel - params.target.troops);
  } else {
    // Pressure-reinforce (forward staging). The bug we're avoiding: two tiles
    // with the same frontline exposure each qualify as the other's
    // reinforce target, so they ping-pong troops between thinks. Requiring
    // strictly more exposure on the target enforces a one-way flow from
    // safer-interior tiles toward more-exposed attacking positions.
    const sourceExposure = getFrontlineExposure(
      params.state,
      params.source.id,
      params.playerId
    );
    const targetExposure = getFrontlineExposure(
      params.state,
      params.target.id,
      params.playerId
    );
    if (sourceExposure >= targetExposure) return null;

    if (touchesEnemy) {
      score += params.stance === "aggressive" ? 5 : 8;
    }
  }

  // Don't strip troops from a tile that itself is under threat — unless we're
  // rushing them to defend a more valuable tile that's in worse trouble.
  const sourceThreat = params.threatByTile.get(params.source.id);
  if (sourceThreat) {
    if (!threat) return null;
    if (sourceThreat.vulnerability >= threat.vulnerability) return null;
  }

  return {
    sourceTileId: params.source.id,
    targetTileId: params.target.id,
    troopsSent,
    score,
    useSea: false,
    kind: threat ? "reinforce_defend" : "reinforce_pressure",
  };
}

function scoreSeaAction(params: {
  state: GameState;
  playerId: PlayerId;
  stance: AIStance;
  source: TileState;
  target: TileState;
  difficulty: Difficulty;
}): CandidateAction | null {
  const sourceDef = params.state.tileDefinitions[params.source.id];
  const targetDef = params.state.tileDefinitions[params.target.id];
  if (!sourceDef || !targetDef) return null;

  // Sea is for landing on enemy or neutral shores — never reinforce by sea,
  // it burns gold and time for zero strategic gain.
  if (params.target.owner === params.playerId) return null;

  const minTroops =
    params.difficulty === "easy" ? 7 : AI.MIN_TROOPS_TO_ATTACK_NORMAL;
  if (params.source.troops < minTroops) return null;

  const troopsSent = computeTroopsToSend(
    params.source,
    params.target,
    true,
    params.difficulty,
    params.stance
  );

  const validation = validateSeaAction({
    state: params.state,
    playerId: params.playerId,
    sourceTileId: params.source.id,
    targetTileId: params.target.id,
    troopsSent,
  });
  if (!validation.valid) return null;

  const winChance = estimateWinChance(troopsSent, params.target.troops);
  if (winChance < 0.5) return null;

  let score = getTargetBaseValue(
    params.state,
    targetDef,
    params.target,
    params.playerId
  );
  score += winChance * 40;
  score -= 8; // base penalty: sea is slower and costs gold

  if (targetDef.isTown) score += 25;
  if (targetDef.isCapital) score += 20;
  if (isTileBusy(params.state, params.target)) score += AI.BUSY_TARGET_BONUS;

  if (params.stance === "aggressive") score += 18;
  if (params.stance === "defensive") score -= 12;

  if (targetDef.isCapital && troopsSent < params.target.troops * 0.5) {
    score -= 50;
  }
  if (params.source.troops - troopsSent < 2) score -= 20;

  if (params.difficulty === "easy") score -= 30;
  else if (params.difficulty === "hard") score += 15;

  return {
    sourceTileId: params.source.id,
    targetTileId: params.target.id,
    troopsSent,
    score,
    useSea: true,
    kind: "attack",
  };
}

// ── Coordinated attack (Hard only) ──────────────────────────────────────────

// Looks for high-value targets that no single owned tile can capture alone,
// but that multiple adjacent tiles can capture together in the same think.
// Returns the best plan found, or null.
function findBestCombinedAttack(
  state: GameState,
  playerId: PlayerId,
  capitalDistances: Map<string, number>
): CombinedAttackPlan | null {
  let best: CombinedAttackPlan | null = null;

  const opponents = getOpponentIds(state, playerId);

  for (const target of Object.values(state.tiles)) {
    if (target.owner === playerId) continue;
    // Skip teammate tiles — they're not valid attack targets in team modes.
    if (isPlayer(target.owner) && !opponents.has(target.owner)) continue;
    const targetDef = state.tileDefinitions[target.id];
    if (!targetDef) continue;

    // Coordination has overhead — only worth it for tiles that materially
    // advance the AI's position.
    const distToCap = capitalDistances.get(target.id) ?? 99;
    const isHighValue =
      targetDef.isCapital ||
      targetDef.isTown ||
      targetDef.hasBridge ||
      distToCap <= 2;
    if (!isHighValue) continue;

    const sourceCandidates: { tile: TileState; canCommit: number }[] = [];
    for (const adjId of targetDef.adjacent) {
      const src = state.tiles[adjId];
      if (!src || src.owner !== playerId) continue;
      if (isTileBusy(state, src)) continue;
      const canCommit = Math.max(0, src.troops - AI.ATTACK_MIN_GARRISON_LEFT);
      if (canCommit < 3) continue;
      sourceCandidates.push({ tile: src, canCommit });
    }
    if (sourceCandidates.length < 2) continue;

    sourceCandidates.sort((a, b) => b.canCommit - a.canCommit);

    const need =
      Math.ceil(target.troops * AI.ATTACK_TARGET_MULTIPLIER) + AI.ATTACK_CUSHION;

    // Skip if the strongest single source can already handle it on its own —
    // a coordinated plan would just spread troops unnecessarily.
    const singleSourceCanWin =
      sourceCandidates[0] !== undefined &&
      sourceCandidates[0].canCommit >= need;
    if (singleSourceCanWin) continue;

    let total = 0;
    const picked: { sourceTileId: string; troopsSent: number }[] = [];
    for (const candidate of sourceCandidates) {
      const send = Math.min(candidate.canCommit, Math.max(1, need - total));
      picked.push({ sourceTileId: candidate.tile.id, troopsSent: send });
      total += send;
      if (total >= need) break;
    }
    if (total < need) continue;
    if (picked.length < 2) continue;

    let score = getTargetBaseValue(state, targetDef, target, playerId) + 60;
    if (targetDef.isCapital) score += 80;
    if (isTileBusy(state, target)) score += AI.BUSY_TARGET_BONUS;
    if (distToCap <= 2) score += 20;

    if (best === null || score > best.score) {
      best = { targetTileId: target.id, sources: picked, score };
    }
  }

  return best;
}

// ── Candidate enumeration ───────────────────────────────────────────────────

function findCandidateActions(params: {
  state: GameState;
  playerId: PlayerId;
  stance: AIStance;
  difficulty: Difficulty;
  threatByTile: Map<string, TileThreat>;
  capitalDistances: Map<string, number>;
}): CandidateAction[] {
  const candidates: CandidateAction[] = [];
  const opponents = getOpponentIds(params.state, params.playerId);

  for (const source of getPlayerTiles(params.state, params.playerId)) {
    if (isTileBusy(params.state, source)) continue;
    const sourceDef = params.state.tileDefinitions[source.id];
    if (!sourceDef) continue;

    for (const adjId of sourceDef.adjacent) {
      const target = params.state.tiles[adjId];
      if (!target) continue;
      // Skip teammate-owned tiles — they're neither attack targets nor
      // legitimate reinforce destinations in team modes.
      if (
        isPlayer(target.owner) &&
        target.owner !== params.playerId &&
        !opponents.has(target.owner)
      ) {
        continue;
      }

      const candidate =
        target.owner === params.playerId
          ? scoreLandReinforce({
              state: params.state,
              playerId: params.playerId,
              stance: params.stance,
              source,
              target,
              difficulty: params.difficulty,
              threatByTile: params.threatByTile,
            })
          : scoreLandAttack({
              state: params.state,
              playerId: params.playerId,
              stance: params.stance,
              source,
              target,
              difficulty: params.difficulty,
              capitalDistances: params.capitalDistances,
            });

      if (candidate) candidates.push(candidate);
    }

    for (const lane of params.state.seaLanes) {
      const targetId =
        lane.from === source.id
          ? lane.to
          : lane.bidirectional && lane.to === source.id
            ? lane.from
            : null;
      if (!targetId) continue;
      const target = params.state.tiles[targetId];
      if (!target) continue;
      if (
        isPlayer(target.owner) &&
        target.owner !== params.playerId &&
        !opponents.has(target.owner)
      ) {
        continue;
      }

      const candidate = scoreSeaAction({
        state: params.state,
        playerId: params.playerId,
        stance: params.stance,
        source,
        target,
        difficulty: params.difficulty,
      });
      if (candidate) candidates.push(candidate);
    }
  }

  return candidates;
}

function chooseCandidateAction(
  candidates: CandidateAction[],
  difficulty: Difficulty
): CandidateAction | null {
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((a, b) => b.score - a.score);

  if (
    difficulty === "easy" &&
    sorted.length > 1 &&
    Math.random() < AI.EASY_SECOND_OR_THIRD_BEST_ACTION_CHANCE
  ) {
    const index = Math.min(sorted.length - 1, Math.random() < 0.5 ? 1 : 2);
    return sorted[index] ?? null;
  }

  return sorted[0] ?? null;
}

// ── Per-player AI logic ─────────────────────────────────────────────────────

// Runs one full think cycle for a single AI player. Does NOT touch the shared
// think timer — the caller is responsible for updating nextThinkAt after all
// players have been processed.
function runAIForPlayer(state: GameState, playerId: PlayerId): GameState {
  let nextState = state;
  const difficulty = nextState.ai.difficulty;

  const nextStance = chooseAIStance(nextState, playerId, nextState.ai.stance);
  if (nextStance !== nextState.ai.stance) {
    nextState = cloneGameState(nextState);
    nextState.ai.stance = nextStance;
    nextState.ai.stanceChangedAt = nextState.now;
  }

  const maxActions = getMaxActionsPerThink(difficulty);
  let actionsTaken = 0;
  // Tracks both source and target IDs of actions taken this think to avoid
  // (a) attacking the same target from two sides when the first attack will
  // already resolve it, and (b) ping-ponging A→B then B→A in one tick.
  const committedTileIds = new Set<string>();

  // ── Hard: try a coordinated multi-source attack first ─────────────────────
  if (difficulty === "hard" && maxActions >= 2) {
    const capitalDistances = computeDistancesToOpponentCapital(
      nextState,
      playerId
    );
    const plan = findBestCombinedAttack(nextState, playerId, capitalDistances);
    if (plan !== null) {
      const slots = Math.min(plan.sources.length, maxActions);
      for (let i = 0; i < slots; i += 1) {
        const part = plan.sources[i];
        if (!part) break;
        nextState = createLandAction({
          state: nextState,
          playerId,
          sourceTileId: part.sourceTileId,
          targetTileId: plan.targetTileId,
          troopsSent: part.troopsSent,
        });
        committedTileIds.add(part.sourceTileId);
        actionsTaken += 1;
      }
      committedTileIds.add(plan.targetTileId);
    }
  }

  // ── Greedy single-source loop for remaining action budget ─────────────────
  while (actionsTaken < maxActions) {
    const threats = assessOwnTileThreats(nextState, playerId);
    const threatByTile = new Map(threats.map((t) => [t.tileId, t]));
    const capitalDistances = computeDistancesToOpponentCapital(
      nextState,
      playerId
    );

    const allCandidates = findCandidateActions({
      state: nextState,
      playerId,
      stance: nextState.ai.stance,
      difficulty,
      threatByTile,
      capitalDistances,
    });

    const candidates = allCandidates.filter(
      (c) =>
        !committedTileIds.has(c.targetTileId) &&
        !committedTileIds.has(c.sourceTileId)
    );

    const action = chooseCandidateAction(candidates, difficulty);
    if (!action) break;

    committedTileIds.add(action.targetTileId);
    committedTileIds.add(action.sourceTileId);

    if (action.useSea) {
      nextState = createSeaAction({
        state: nextState,
        playerId,
        sourceTileId: action.sourceTileId,
        targetTileId: action.targetTileId,
        troopsSent: action.troopsSent,
      });
    } else {
      nextState = createLandAction({
        state: nextState,
        playerId,
        sourceTileId: action.sourceTileId,
        targetTileId: action.targetTileId,
        troopsSent: action.troopsSent,
      });
    }
    actionsTaken += 1;
  }

  nextState = performAIUpgrades(nextState, playerId);

  return nextState;
}

// ── Main entry ──────────────────────────────────────────────────────────────

// Runs one AI think cycle for all non-human players when the shared timer
// elapses. All AI players act before the timer resets, so player3/player4
// never see a future nextThinkAt caused by player2 having just run.
export function updateAI(state: GameState): GameState {
  if (state.phase !== "playing") return state;
  if (state.now < state.ai.nextThinkAt) return state;

  let nextState = cloneGameState(state);

  for (const [id, player] of Object.entries(nextState.players)) {
    if (id === "player1") continue;
    if (!player) continue;
    nextState = runAIForPlayer(nextState, id as PlayerId);
  }

  nextState.ai.lastThinkAt = nextState.now;
  nextState.ai.nextThinkAt =
    nextState.now + getThinkDelaySeconds(nextState.ai.difficulty);
  return nextState;
}

// ── Upgrades: fortify and armour ────────────────────────────────────────────

function performAIUpgrades(state: GameState, playerId: PlayerId): GameState {
  let nextState = state;
  const player = nextState.players[playerId];
  if (!player) return nextState;
  const difficulty = nextState.ai.difficulty;

  // Hard fortifies aggressively and starts with the capital. Normal builds
  // less, Easy barely at all.
  const fortCapCapital =
    difficulty === "hard" ? FORT.MAX_LEVEL : difficulty === "normal" ? 4 : 3;
  const fortCapTown =
    difficulty === "hard" ? 4 : difficulty === "normal" ? 3 : 2;
  const fortCapBridge = difficulty === "hard" ? 3 : 2;
  const goldBuffer =
    difficulty === "hard" ? 1 : difficulty === "normal" ? 3 : 5;

  if (player.gold >= FORT.GOLD_COST_PER_LEVEL + goldBuffer) {
    // Sort candidates by priority rather than picking the first match — this
    // ensures the capital always gets fortified before a town when both are
    // eligible the same tick.
    const candidates: { tileId: string; priority: number }[] = [];
    for (const [tileId, tile] of Object.entries(nextState.tiles)) {
      if (tile.owner !== playerId) continue;
      if (tile.busyUntil !== null && tile.busyUntil > nextState.now) continue;
      const def = nextState.tileDefinitions[tileId];
      if (!def) continue;
      let cap = 0;
      let priority = 0;
      if (def.isCapital) {
        cap = fortCapCapital;
        priority = 100;
      } else if (def.hasBridge && difficulty !== "easy") {
        cap = fortCapBridge;
        priority = 50;
      } else if (def.isTown) {
        cap = fortCapTown;
        priority = 30;
      }
      if (cap === 0 || tile.fortLevel >= cap) continue;
      candidates.push({ tileId, priority });
    }
    candidates.sort((a, b) => b.priority - a.priority);
    if (candidates[0]) {
      nextState = buildFortification({
        state: nextState,
        playerId,
        tileId: candidates[0].tileId,
      });
    }
  }

  // Armour: Hard equips the tile leading the assault (high troops, close to
  // enemy capital). Normal/Easy just armour the biggest stack they've got.
  // `player` reflects pre-fortify state; re-read after the fortify spend.
  const playerAfterFort = nextState.players[playerId];
  if (playerAfterFort && playerAfterFort.gold >= ARMOUR.GOLD_COST + 3) {
    let bestId: string | null = null;
    if (difficulty === "hard") {
      const capDistances = computeDistancesToOpponentCapital(
        nextState,
        playerId
      );
      let bestScore = -1;
      for (const [tileId, tile] of Object.entries(nextState.tiles)) {
        if (tile.owner !== playerId || tile.armoured) continue;
        if (tile.troops < 12) continue;
        const dist = capDistances.get(tileId) ?? 99;
        const score = tile.troops * 2 - dist * 6;
        if (score > bestScore) {
          bestScore = score;
          bestId = tileId;
        }
      }
    } else {
      let bestTroops = 14;
      for (const [tileId, tile] of Object.entries(nextState.tiles)) {
        if (tile.owner !== playerId || tile.armoured) continue;
        if (tile.troops > bestTroops) {
          bestTroops = tile.troops;
          bestId = tileId;
        }
      }
    }
    if (bestId !== null) {
      nextState = applyArmour({ state: nextState, playerId, tileId: bestId });
    }
  }

  return nextState;
}
