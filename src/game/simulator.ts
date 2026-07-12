/**
 * simulator.ts — Headless game simulation for testing and balance analysis.
 *
 * The game loop runs as fast as possible (no requestAnimationFrame), stepping
 * forward by a fixed delta each tick. Two bot types are available:
 *   - "random": picks a random legal action each think cycle
 *   - "ai":     uses the built-in AI (only valid for non-player1 slots)
 *
 * Key exports:
 *   runGame()    — runs one game to completion or timeout, returns a GameResult
 *   runBatch()   — runs N games and aggregates the results into a BatchResult
 *   replayGame() — approximately replays a recorded game from its action log
 */

import { createLandAction, createSeaAction, buildFortification, applyArmour } from "./actions";
import { updateAI } from "./ai";
import { ARMOUR, FORT } from "./constants";
import { validateLandAction, validateSeaAction } from "./movement";
import { cloneGameState, createInitialGameState, getActivePlayerIds } from "./state";
import { updateGame } from "./simulation";
import type { ActiveAction, Difficulty, GameState, MapId, PlayerId, PlayerMode } from "./types";

// ── Public types ──────────────────────────────────────────────────────────────

// One entry per action dispatched during a simulated game.
// Fortify and armour are logged using sourceTileId as the affected tile;
// targetTileId is the same as sourceTileId for those two types.
export interface LoggedAction {
  gameTime: number;
  type: ActiveAction["type"] | "fortify" | "armour";
  playerId: PlayerId;
  sourceTileId: string;
  targetTileId: string;
  troopsSent: number;
}

/** Lightweight feel metrics sampled every 5 s during a game. */
export interface GameMetrics {
  /** Highest troop count seen on any single tile — signals runaway stacks. */
  peakSingleTileTroops: number;
  /** Highest % of all claimed (non-neutral) tiles held by one team — 100 = one-sided stomp. */
  peakTerritorySharePercent: number;
}

/** State snapshot taken when a game times out — used to classify deadlocks. */
export interface TimeoutSnapshot {
  /** Legal move count per player at the moment the clock ran out. */
  validMovesByPlayer: Record<string, number>;
  /** In-flight actions still pending at timeout. */
  pendingActions: number;
  /** Total troops per player at timeout. */
  troopsByPlayer: Record<string, number>;
  /** Tile count per player at timeout. */
  territoryByPlayer: Record<string, number>;
}

export interface GameResult {
  winner: string | null;           // winning TeamId, or null on draw/timeout
  gameTimeSeconds: number;
  timedOut: boolean;
  actionCount: number;
  actionsByPlayer: Record<string, number>;
  failedAttempts: number;          // bot moves that passed pre-filter but failed at dispatch
  error: string | null;
  warnings: string[];
  actionLog: LoggedAction[];
  initialState: GameState;         // starting snapshot — enables replay
  metrics: GameMetrics;
  timeoutSnapshot: TimeoutSnapshot | null;
}

export interface BatchResult {
  totalGames: number;
  wins: Record<string, number>;    // teamId → win count
  draws: number;
  timeouts: number;
  errors: number;
  warningCount: number;
  totalFailedAttempts: number;     // sum of per-game failedAttempts across the batch
  avgGameTimeSeconds: number;
  minGameTimeSeconds: number;
  maxGameTimeSeconds: number;
  avgActionsPerGame: number;
  errorSamples: string[];          // up to 5 unique error messages
  avgPeakTileTroops: number;
  maxPeakTileTroops: number;
  /** Timeouts where every active player had 0 valid moves — genuine map deadlocks. */
  hardDeadlocks: number;
}

// "random" uses the lightweight random bot defined in this file.
// "greedy" always attacks the highest-win-probability target with max troops.
// "ai"     uses the built-in AI from ai.ts (only valid for non-player1 slots).
export type BotMode = "random" | "greedy" | "ai";

export interface SimulationOptions {
  difficulty?: Difficulty;
  playerMode?: PlayerMode;
  mapId?: MapId;
  // Who controls player1 (the "human" slot).
  player1Bot?: "random" | "greedy";
  // Who controls all other player slots.
  othersBots?: BotMode;
  // Maximum game-time seconds before a run is declared a timeout.
  maxGameSeconds?: number;
  // Simulated seconds per tick. Smaller = more accurate, slower to run.
  tickDelta?: number;
  // Called after each game completes. Useful for progress reporting.
  onGameComplete?: (result: GameResult, index: number) => void;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

const DEFAULT_MAX_SECONDS  = 600;  // 10 minutes of simulated game time
const DEFAULT_TICK_DELTA   = 0.05; // 50ms per tick (20fps equivalent)
const RANDOM_THINK_INTERVAL = 1.5; // seconds between random-bot decisions

function isTileBusy(state: GameState, tileId: string): boolean {
  const tile = state.tiles[tileId];
  return tile !== undefined && tile.busyUntil !== null && tile.busyUntil > state.now;
}

function pickRandom<T>(arr: T[]): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[Math.floor(Math.random() * arr.length)];
}

// Returns newly queued actions — those in `next` that were not in `prev`.
function findNewActiveActions(prev: GameState, next: GameState): ActiveAction[] {
  const prevIds = new Set(prev.activeActions.map(a => a.id));
  return next.activeActions.filter(a => !prevIds.has(a.id));
}

// Sanity-checks the game state. Returns all violations found (empty = clean).
function checkStateHealth(state: GameState): string[] {
  const issues: string[] = [];

  // Tile troop counts
  for (const [id, tile] of Object.entries(state.tiles)) {
    if (!isFinite(tile.troops)) issues.push(`tile ${id}: non-finite troops (${tile.troops})`);
    else if (tile.troops < -0.01) issues.push(`tile ${id}: negative troops (${tile.troops.toFixed(3)})`);
  }

  // Player gold — must be non-negative and must not exceed cap
  for (const [id, player] of Object.entries(state.players)) {
    if (!player) continue;
    if (!isFinite(player.gold))           issues.push(`${id}: non-finite gold (${player.gold})`);
    else if (player.gold < -0.01)         issues.push(`${id}: negative gold (${player.gold.toFixed(3)})`);
    else if (player.gold > player.goldCap + 0.01) issues.push(`${id}: gold ${player.gold.toFixed(2)} exceeds cap ${player.goldCap}`);
  }

  // Active action queue sanity
  if (state.activeActions.length > 500) {
    issues.push(`action queue overflow (${state.activeActions.length} pending)`);
  }
  const seenActionIds = new Set<string>();
  for (const action of state.activeActions) {
    if (seenActionIds.has(action.id)) {
      issues.push(`duplicate active action id: ${action.id}`);
    }
    seenActionIds.add(action.id);

    if (!state.tiles[action.sourceTileId]) issues.push(`action ${action.id}: source tile "${action.sourceTileId}" missing`);
    if (!state.tiles[action.targetTileId]) issues.push(`action ${action.id}: target tile "${action.targetTileId}" missing`);
    if (!state.players[action.owner])      issues.push(`action ${action.id}: owner "${action.owner}" not an active player`);
    if (action.troopsSent < 1)             issues.push(`action ${action.id}: troopsSent ${action.troopsSent} < 1`);
    if (action.resolvesAt < action.startedAt) issues.push(`action ${action.id}: resolvesAt (${action.resolvesAt.toFixed(2)}) < startedAt (${action.startedAt.toFixed(2)})`);
  }

  // Game phase must be consistent with winningTeam
  if (state.phase === "ended" && state.winningTeam === null) {
    issues.push(`phase is "ended" but winningTeam is null`);
  }
  if (state.phase === "playing" && state.winningTeam !== null) {
    issues.push(`phase is "playing" but winningTeam is already set to "${state.winningTeam}"`);
  }

  return issues;
}

// ── Random bot ────────────────────────────────────────────────────────────────

// Collects every legal land and sea move for a given player this tick.
function findLegalMoves(
  state: GameState,
  playerId: PlayerId,
): Array<{ sourceTileId: string; targetTileId: string; isSea: boolean }> {
  const moves: Array<{ sourceTileId: string; targetTileId: string; isSea: boolean }> = [];

  for (const [tileId, tile] of Object.entries(state.tiles)) {
    if (tile.owner !== playerId) continue;
    if (isTileBusy(state, tileId)) continue;

    const def = state.tileDefinitions[tileId];
    if (!def) continue;

    for (const adjId of def.adjacent) {
      if (validateLandAction({ state, playerId, sourceTileId: tileId, targetTileId: adjId, troopsSent: 1 }).valid) {
        moves.push({ sourceTileId: tileId, targetTileId: adjId, isSea: false });
      }
    }

    for (const lane of state.seaLanes) {
      const targetId =
        lane.from === tileId ? lane.to
        : (lane.bidirectional && lane.to === tileId ? lane.from : null);
      if (!targetId) continue;
      if (validateSeaAction({ state, playerId, sourceTileId: tileId, targetTileId: targetId, troopsSent: 1 }).valid) {
        moves.push({ sourceTileId: tileId, targetTileId: targetId, isSea: true });
      }
    }
  }

  return moves;
}

// Runs one think cycle for the random bot controlling a single player.
// Returns the updated state and a count of moves that passed pre-filter but
// were rejected at dispatch (indicates state changed mid-cycle or a bot bug).
function applyRandomBotForPlayer(
  state: GameState,
  playerId: PlayerId,
): { state: GameState; failedAttempts: number } {
  let nextState = state;
  let failedAttempts = 0;
  const player = nextState.players[playerId];
  if (!player) return { state: nextState, failedAttempts };

  // Separate moves into attacks (enemy/neutral target) and reinforcements (own
  // territory). Strongly prefer attacking to avoid games stalling in stalemate.
  const moves = findLegalMoves(nextState, playerId);
  const attackMoves = moves.filter(m => {
    const target = nextState.tiles[m.targetTileId];
    return target && target.owner !== playerId;
  });
  const reinforceMoves = moves.filter(m => {
    const target = nextState.tiles[m.targetTileId];
    return target && target.owner === playerId;
  });

  // 80% chance to attack if any attack moves are available, otherwise reinforce.
  const isAttack = attackMoves.length > 0 && (reinforceMoves.length === 0 || Math.random() < 0.8);
  const move = isAttack ? pickRandom(attackMoves) : pickRandom(reinforceMoves);

  if (move) {
    const sourceTile = nextState.tiles[move.sourceTileId];
    if (sourceTile) {
      // Send more troops when attacking, fewer when reinforcing.
      const factor     = isAttack ? 0.6 + Math.random() * 0.4 : 0.2 + Math.random() * 0.3;
      let   troopsSent = Math.max(1, Math.floor(sourceTile.troops * factor));

      // Validate with the actual troopsSent before dispatching.
      // For sea actions the cost scales with troops, so a high troop count may
      // exceed the player's gold even though the pre-filter (troopsSent=1)
      // passed — fall back to 1 troop in that case. Land failures (typically
      // float troop counts leaving < 1 behind) are counted as bot imperfections.
      let preCheck = move.isSea
        ? validateSeaAction({ state: nextState, playerId, sourceTileId: move.sourceTileId, targetTileId: move.targetTileId, troopsSent })
        : validateLandAction({ state: nextState, playerId, sourceTileId: move.sourceTileId, targetTileId: move.targetTileId, troopsSent });

      if (!preCheck.valid && move.isSea && troopsSent > 1) {
        troopsSent = 1;
        preCheck   = validateSeaAction({ state: nextState, playerId, sourceTileId: move.sourceTileId, targetTileId: move.targetTileId, troopsSent: 1 });
      }

      if (!preCheck.valid) {
        failedAttempts++;
      } else {
        nextState = move.isSea
          ? createSeaAction({ state: nextState, playerId, sourceTileId: move.sourceTileId, targetTileId: move.targetTileId, troopsSent })
          : createLandAction({ state: nextState, playerId, sourceTileId: move.sourceTileId, targetTileId: move.targetTileId, troopsSent });
      }
    }
  }

  // Occasionally fortify a tile. Prefers capitals and towns.
  if (player.gold >= FORT.GOLD_COST_PER_LEVEL && Math.random() < 0.25) {
    const candidates = Object.entries(nextState.tiles)
      .filter(([id, t]) => t.owner === playerId && !isTileBusy(nextState, id) && t.fortLevel < FORT.MAX_LEVEL)
      .sort(([aId], [bId]) => {
        const aDef = nextState.tileDefinitions[aId];
        const bDef = nextState.tileDefinitions[bId];
        const aPri = aDef?.isCapital ? 2 : aDef?.isTown ? 1 : 0;
        const bPri = bDef?.isCapital ? 2 : bDef?.isTown ? 1 : 0;
        return bPri - aPri;
      })
      .map(([id]) => id);
    const tileId = pickRandom(candidates.slice(0, 3)); // top 3 by priority then random
    if (tileId) nextState = buildFortification({ state: nextState, playerId, tileId });
  }

  // Occasionally armour a tile with enough troops.
  const playerAfter = nextState.players[playerId];
  if (playerAfter && playerAfter.gold >= ARMOUR.GOLD_COST && Math.random() < 0.15) {
    const candidates = Object.entries(nextState.tiles)
      .filter(([, t]) => t.owner === playerId && !t.armoured && t.troops > 5)
      .map(([id]) => id);
    const tileId = pickRandom(candidates);
    if (tileId) nextState = applyArmour({ state: nextState, playerId, tileId });
  }

  return { state: nextState, failedAttempts };
}

// Always attacks the highest-win-probability reachable target, sending the
// maximum available troops. Never reinforces — pure aggressor. This gives a
// much harder baseline than the random bot and exercises mid/late-game paths
// that random play rarely reaches.
function applyGreedyBotForPlayer(
  state: GameState,
  playerId: PlayerId,
): { state: GameState; failedAttempts: number } {
  let nextState = state;
  let failedAttempts = 0;
  if (!nextState.players[playerId]) return { state: nextState, failedAttempts };

  const moves = findLegalMoves(nextState, playerId);
  const attackMoves = moves.filter(m => {
    const target = nextState.tiles[m.targetTileId];
    return target && target.owner !== playerId;
  });
  if (attackMoves.length === 0) return { state: nextState, failedAttempts };

  // Score each attack: win probability if sending floor(troops)-1.
  let bestMove: { sourceTileId: string; targetTileId: string; isSea: boolean; troopsSent: number } | null = null;
  let bestScore = -Infinity;
  for (const move of attackMoves) {
    const source = nextState.tiles[move.sourceTileId];
    const target = nextState.tiles[move.targetTileId];
    if (!source || !target) continue;
    const troopsSent = Math.max(1, Math.floor(source.troops) - 1);
    const score = troopsSent / (troopsSent + Math.max(1, target.troops));
    if (score > bestScore) { bestScore = score; bestMove = { ...move, troopsSent }; }
  }
  if (!bestMove) return { state: nextState, failedAttempts };

  let { troopsSent } = bestMove;
  let preCheck = bestMove.isSea
    ? validateSeaAction({ state: nextState, playerId, sourceTileId: bestMove.sourceTileId, targetTileId: bestMove.targetTileId, troopsSent })
    : validateLandAction({ state: nextState, playerId, sourceTileId: bestMove.sourceTileId, targetTileId: bestMove.targetTileId, troopsSent });

  if (!preCheck.valid && bestMove.isSea && troopsSent > 1) {
    troopsSent = 1;
    preCheck = validateSeaAction({ state: nextState, playerId, sourceTileId: bestMove.sourceTileId, targetTileId: bestMove.targetTileId, troopsSent: 1 });
  }

  if (!preCheck.valid) {
    failedAttempts++;
    return { state: nextState, failedAttempts };
  }

  nextState = bestMove.isSea
    ? createSeaAction({ state: nextState, playerId, sourceTileId: bestMove.sourceTileId, targetTileId: bestMove.targetTileId, troopsSent })
    : createLandAction({ state: nextState, playerId, sourceTileId: bestMove.sourceTileId, targetTileId: bestMove.targetTileId, troopsSent });

  return { state: nextState, failedAttempts };
}

function applyBotForPlayer(
  state: GameState,
  playerId: PlayerId,
  bot: "random" | "greedy",
): { state: GameState; failedAttempts: number } {
  return bot === "greedy"
    ? applyGreedyBotForPlayer(state, playerId)
    : applyRandomBotForPlayer(state, playerId);
}

// Runs one think cycle for all active players.
//
// In AI mode the random bot (player1) and the built-in AI run on independent
// timers. A real player clicks whenever they want — the AI's think speed must
// not throttle or accidentally accelerate the simulated player's action rate.
// `randomBotNextThinkAt` is owned by the caller (runGame) and threaded through
// here so it survives across ticks without touching GameState.
//
// In all-random mode all players share one timer so their relative action
// rates are equal, keeping win-rate comparisons unbiased.
function updateBots(
  state: GameState,
  player1Bot: "random" | "greedy",
  othersBots: BotMode,
  randomBotNextThinkAt: number,
): { state: GameState; failedAttempts: number; randomBotNextThinkAt: number } {
  if (state.phase !== "playing") return { state, failedAttempts: 0, randomBotNextThinkAt };

  let nextState = state;
  let failedAttempts = 0;
  let nextRandomBotThinkAt = randomBotNextThinkAt;

  if (othersBots === "ai") {
    // Player1 and AI run on independent timers so the AI's think speed doesn't
    // throttle or accelerate the simulated player's action rate.
    if (state.now >= randomBotNextThinkAt) {
      const result = applyBotForPlayer(cloneGameState(nextState), "player1", player1Bot);
      nextState = result.state;
      failedAttempts += result.failedAttempts;
      nextRandomBotThinkAt = state.now + RANDOM_THINK_INTERVAL;
    }
    nextState = updateAI(nextState);
  } else {
    // All-bot mode (random or greedy): shared timer, shuffle order each cycle.
    if (state.now < state.ai.nextThinkAt) return { state, failedAttempts: 0, randomBotNextThinkAt };

    nextState = cloneGameState(state);
    const players = [...getActivePlayerIds(nextState)];
    for (let i = players.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [players[i], players[j]] = [players[j]!, players[i]!];
    }
    for (const playerId of players) {
      const bot = playerId === "player1" ? player1Bot : (othersBots === "greedy" ? "greedy" : "random");
      const result = applyBotForPlayer(nextState, playerId, bot);
      nextState = result.state;
      failedAttempts += result.failedAttempts;
    }
    nextState.ai.lastThinkAt = nextState.now;
    nextState.ai.nextThinkAt = nextState.now + RANDOM_THINK_INTERVAL;
  }

  return { state: nextState, failedAttempts, randomBotNextThinkAt: nextRandomBotThinkAt };
}

// ── Metrics helpers ───────────────────────────────────────────────────────────

function samplePeakTileTroops(state: GameState): number {
  let peak = 0;
  for (const tile of Object.values(state.tiles)) {
    if (tile.troops > peak) peak = tile.troops;
  }
  return peak;
}

// Highest fraction of claimed (non-neutral) tiles held by a single team.
function samplePeakTerritoryShare(state: GameState): number {
  const byTeam: Record<string, number> = {};
  let claimed = 0;
  for (const tile of Object.values(state.tiles)) {
    if (tile.owner === "neutral") continue;
    claimed++;
    const player = state.players[tile.owner as PlayerId];
    if (!player) continue;
    byTeam[player.teamId] = (byTeam[player.teamId] ?? 0) + 1;
  }
  if (claimed === 0) return 0;
  return (Math.max(0, ...Object.values(byTeam)) / claimed) * 100;
}

function buildTimeoutSnapshot(state: GameState): TimeoutSnapshot {
  const validMovesByPlayer: Record<string, number> = {};
  const troopsByPlayer: Record<string, number> = {};
  const territoryByPlayer: Record<string, number> = {};

  for (const playerId of getActivePlayerIds(state)) {
    validMovesByPlayer[playerId] = findLegalMoves(state, playerId).length;
    let troops = 0, territory = 0;
    for (const tile of Object.values(state.tiles)) {
      if (tile.owner === playerId) { troops += tile.troops; territory++; }
    }
    troopsByPlayer[playerId] = Math.round(troops);
    territoryByPlayer[playerId] = territory;
  }

  return {
    validMovesByPlayer,
    pendingActions: state.activeActions.length,
    troopsByPlayer,
    territoryByPlayer,
  };
}

// ── Core simulation loop ──────────────────────────────────────────────────────

export function runGame(options: SimulationOptions = {}): GameResult {
  const tickDelta      = options.tickDelta      ?? DEFAULT_TICK_DELTA;
  const maxGameSeconds = options.maxGameSeconds ?? DEFAULT_MAX_SECONDS;
  const player1Bot     = options.player1Bot     ?? "random";
  const othersBots     = options.othersBots     ?? "ai";

  const initialState = createInitialGameState(
    options.difficulty ?? "normal",
    options.playerMode ?? "1v1",
    options.mapId ?? "river_crown",
  );

  const actionLog: LoggedAction[] = [];
  const warnings: string[] = [];
  const actionsByPlayer: Record<string, number> = {};
  let failedAttempts = 0;
  let peakSingleTileTroops = 0;
  let peakTerritorySharePercent = 0;

  // Skip preview — in simulation there is no 4-second countdown.
  let state: GameState = { ...cloneGameState(initialState), phase: "playing" };
  // Random bot's independent think clock (only relevant in AI mode).
  let randomBotNextThinkAt = 0;

  try {
    while (state.phase === "playing" && state.now < maxGameSeconds) {
      const prev = state;

      state = updateGame(state, tickDelta);
      const botResult = updateBots(state, player1Bot, othersBots, randomBotNextThinkAt);
      state = botResult.state;
      failedAttempts += botResult.failedAttempts;
      randomBotNextThinkAt = botResult.randomBotNextThinkAt;

      // Record newly queued actions by diffing the active-action list.
      for (const action of findNewActiveActions(prev, state)) {
        const entry: LoggedAction = {
          gameTime:     state.now,
          type:         action.type,
          playerId:     action.owner,
          sourceTileId: action.sourceTileId,
          targetTileId: action.targetTileId,
          troopsSent:   action.troopsSent,
        };
        actionLog.push(entry);
        actionsByPlayer[action.owner] = (actionsByPlayer[action.owner] ?? 0) + 1;
      }

      // Periodic health check + metrics sample (every ~5 simulated seconds).
      if (Math.round(state.now / tickDelta) % Math.round(5 / tickDelta) === 0) {
        for (const issue of checkStateHealth(state)) {
          warnings.push(`t=${state.now.toFixed(1)}: ${issue}`);
        }
        if (warnings.length >= 10) break;

        const tilePeak = samplePeakTileTroops(state);
        if (tilePeak > peakSingleTileTroops) peakSingleTileTroops = tilePeak;

        const sharePeak = samplePeakTerritoryShare(state);
        if (sharePeak > peakTerritorySharePercent) peakTerritorySharePercent = sharePeak;
      }
    }
  } catch (err) {
    return {
      winner:          null,
      gameTimeSeconds: state.now,
      timedOut:        false,
      actionCount:     actionLog.length,
      actionsByPlayer,
      failedAttempts,
      error:           err instanceof Error ? err.message : String(err),
      warnings,
      actionLog,
      initialState,
      metrics:         { peakSingleTileTroops, peakTerritorySharePercent },
      timeoutSnapshot: null,
    };
  }

  const timedOut = state.phase === "playing";

  return {
    winner:          state.winningTeam ?? null,
    gameTimeSeconds: state.now,
    timedOut,
    actionCount:     actionLog.length,
    actionsByPlayer,
    failedAttempts,
    error:           null,
    warnings,
    actionLog,
    initialState,
    metrics:         { peakSingleTileTroops, peakTerritorySharePercent },
    timeoutSnapshot: timedOut ? buildTimeoutSnapshot(state) : null,
  };
}

// ── Batch runner ──────────────────────────────────────────────────────────────

export function runBatch(count: number, options: SimulationOptions = {}): BatchResult {
  const wins: Record<string, number> = {};
  let draws = 0, timeouts = 0, errors = 0, warningCount = 0, totalFailedAttempts = 0;
  let totalTime = 0, minTime = Infinity, maxTime = 0, totalActions = 0;
  let totalPeakTileTroops = 0, maxPeakTileTroops = 0, hardDeadlocks = 0;
  const errorSamples: string[] = [];

  for (let i = 0; i < count; i++) {
    const result = runGame(options);

    options.onGameComplete?.(result, i);

    if (result.error) {
      errors++;
      if (errorSamples.length < 5 && !errorSamples.includes(result.error)) {
        errorSamples.push(result.error);
      }
    } else if (result.timedOut) {
      timeouts++;
      if (result.timeoutSnapshot) {
        const allStuck = Object.values(result.timeoutSnapshot.validMovesByPlayer).every(n => n === 0);
        if (allStuck) hardDeadlocks++;
      }
    } else if (result.winner === null) {
      draws++;
    } else {
      wins[result.winner] = (wins[result.winner] ?? 0) + 1;
    }

    warningCount        += result.warnings.length;
    totalFailedAttempts += result.failedAttempts;
    totalTime           += result.gameTimeSeconds;
    totalActions        += result.actionCount;
    if (result.gameTimeSeconds < minTime) minTime = result.gameTimeSeconds;
    if (result.gameTimeSeconds > maxTime) maxTime = result.gameTimeSeconds;

    totalPeakTileTroops += result.metrics.peakSingleTileTroops;
    if (result.metrics.peakSingleTileTroops > maxPeakTileTroops) {
      maxPeakTileTroops = result.metrics.peakSingleTileTroops;
    }
  }

  return {
    totalGames:          count,
    wins,
    draws,
    timeouts,
    errors,
    warningCount,
    totalFailedAttempts,
    avgGameTimeSeconds:  totalTime / count,
    minGameTimeSeconds:  minTime === Infinity ? 0 : minTime,
    maxGameTimeSeconds:  maxTime,
    avgActionsPerGame:   totalActions / count,
    errorSamples,
    avgPeakTileTroops:   totalPeakTileTroops / count,
    maxPeakTileTroops,
    hardDeadlocks,
  };
}

// ── Replay ────────────────────────────────────────────────────────────────────

// Approximately replays a recorded game from its initial-state snapshot and
// action log. Replay is NOT bit-perfect — combat outcomes and neutral behaviour
// use Math.random() and will differ from the original run. What it does
// preserve is the sequence and timing of player/bot decisions, making it
// useful for debugging and auditing unusual game progressions.
export function replayGame(
  result: GameResult,
  options: { tickDelta?: number; maxGameSeconds?: number } = {},
): GameResult {
  const tickDelta      = options.tickDelta      ?? DEFAULT_TICK_DELTA;
  const maxGameSeconds = options.maxGameSeconds ?? DEFAULT_MAX_SECONDS;

  let state: GameState = { ...cloneGameState(result.initialState), phase: "playing" };

  const replayLog = [...result.actionLog].sort((a, b) => a.gameTime - b.gameTime);
  let logIndex = 0;

  const replayedActions: LoggedAction[] = [];
  const warnings: string[] = [];
  const actionsByPlayer: Record<string, number> = {};

  try {
    while (state.phase === "playing" && state.now < maxGameSeconds) {
      // Apply logged actions whose recorded game time has been reached.
      while (logIndex < replayLog.length) {
        const entry = replayLog[logIndex];
        if (!entry || entry.gameTime > state.now) break;
        logIndex++;

        let nextState = state;
        switch (entry.type) {
          case "land_attack":
          case "land_reinforce":
            nextState = createLandAction({ state, playerId: entry.playerId, sourceTileId: entry.sourceTileId, targetTileId: entry.targetTileId, troopsSent: entry.troopsSent });
            break;
          case "sea_attack":
          case "sea_move":
            nextState = createSeaAction({ state, playerId: entry.playerId, sourceTileId: entry.sourceTileId, targetTileId: entry.targetTileId, troopsSent: entry.troopsSent });
            break;
          case "fortify":
            nextState = buildFortification({ state, playerId: entry.playerId, tileId: entry.sourceTileId });
            break;
          case "armour":
            nextState = applyArmour({ state, playerId: entry.playerId, tileId: entry.sourceTileId });
            break;
        }

        // The action may be invalid in this replay run (e.g. tile already captured).
        // Only commit it if the state actually changed.
        if (nextState !== state) {
          state = nextState;
          replayedActions.push(entry);
          actionsByPlayer[entry.playerId] = (actionsByPlayer[entry.playerId] ?? 0) + 1;
        } else {
          warnings.push(`t=${entry.gameTime.toFixed(1)}: could not replay ${entry.type} ${entry.sourceTileId}→${entry.targetTileId}`);
        }
      }

      state = updateGame(state, tickDelta);
    }
  } catch (err) {
    return {
      winner:          null,
      gameTimeSeconds: state.now,
      timedOut:        false,
      actionCount:     replayedActions.length,
      actionsByPlayer,
      failedAttempts:  0,
      error:           err instanceof Error ? err.message : String(err),
      warnings,
      actionLog:       replayedActions,
      initialState:    result.initialState,
      metrics:         { peakSingleTileTroops: 0, peakTerritorySharePercent: 0 },
      timeoutSnapshot: null,
    };
  }

  return {
    winner:          state.winningTeam ?? null,
    gameTimeSeconds: state.now,
    timedOut:        state.phase === "playing",
    actionCount:     replayedActions.length,
    actionsByPlayer,
    failedAttempts:  0,
    error:           null,
    warnings,
    actionLog:       replayedActions,
    initialState:    result.initialState,
    metrics:         { peakSingleTileTroops: 0, peakTerritorySharePercent: 0 },
    timeoutSnapshot: null,
  };
}
