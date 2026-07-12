#!/usr/bin/env tsx
/**
 * simulate.ts — CLI runner for the Iron Vale headless simulator.
 *
 * Usage:
 *   npm run simulate
 *   npm run simulate -- --count 200 --mode 2v2 --difficulty hard --bot random
 *
 * Options:
 *   --count N          Number of games to simulate (default: 100)
 *   --mode MODE        Player mode: 1v1 | 1v1v1 | 1v1v1v1 | 2v2 (default: 1v1)
 *   --map MAP          Map: river_crown | borderlands | shattered_isles (default: river_crown)
 *   --difficulty DIFF  AI difficulty: easy | normal | hard (default: normal)
 *   --bot TYPE         Bot for non-player1 slots: random | ai (default: ai)
 *   --replay           After the batch, replay the last game and print its action log
 *   --verbose          Print each game result as it completes
 */

import type { BatchResult, BotMode, GameResult, SimulationOptions } from "../src/game/simulator";
import { runBatch, runGame, replayGame } from "../src/game/simulator";
import type { Difficulty, MapId, PlayerMode } from "../src/game/types";

// ── Argument parsing ──────────────────────────────────────────────────────────

function getArg(flag: string, fallback: string): string {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= process.argv.length) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

const count      = parseInt(getArg("--count", "100"), 10);
const mode       = getArg("--mode", "1v1") as PlayerMode;
const mapId      = getArg("--map", "river_crown") as MapId;
const difficulty = getArg("--difficulty", "normal") as Difficulty;
const botMode    = getArg("--bot", "ai") as BotMode;
const player1Bot = (botMode === "greedy" ? "greedy" : "random") as "random" | "greedy";
const verbose    = hasFlag("--verbose");
const doReplay   = hasFlag("--replay");

// ── Formatting helpers ────────────────────────────────────────────────────────

function pct(n: number, total: number): string {
  if (total === 0) return "0%";
  return `${((n / total) * 100).toFixed(1)}%`;
}

function fmtTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function progress(done: number, total: number): string {
  const width = 30;
  const filled = Math.round((done / total) * width);
  const bar = "█".repeat(filled) + "░".repeat(width - filled);
  return `[${bar}] ${done}/${total}`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log(`\nIron Vale Simulator`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`Mode: ${mode}  ·  Difficulty: ${difficulty}  ·  Bot: player1=${player1Bot}, others=${botMode}`);
console.log(`Running ${count} game${count !== 1 ? "s" : ""}...\n`);

const options: SimulationOptions = {
  playerMode:  mode,
  mapId,
  difficulty,
  player1Bot,
  othersBots:  botMode,
  onGameComplete: (result: GameResult, i: number) => {
    if (verbose) {
      const status = result.error    ? `ERROR: ${result.error}`
                   : result.timedOut ? `TIMEOUT`
                   : result.winner   ? `${result.winner} wins`
                   : `DRAW`;
      console.log(`  Game ${String(i + 1).padStart(3)}: ${fmtTime(result.gameTimeSeconds).padEnd(8)} ${result.actionCount.toString().padStart(4)} actions  ${status}`);
      if (result.warnings.length > 0) {
        for (const w of result.warnings) console.log(`    ⚠ ${w}`);
      }
    } else if ((i + 1) % Math.max(1, Math.floor(count / 20)) === 0 || i + 1 === count) {
      process.stdout.write(`\r  ${progress(i + 1, count)}`);
    }
  },
};

const startMs = Date.now();
const batch: BatchResult = runBatch(count, options);
const elapsedMs = Date.now() - startMs;

if (!verbose) console.log(""); // newline after progress bar

// ── Results ───────────────────────────────────────────────────────────────────

console.log(`\nResults  (${(elapsedMs / 1000).toFixed(1)}s real time)`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`  Games run:         ${batch.totalGames}`);

const totalDecided = batch.totalGames - batch.timeouts - batch.errors;
for (const [teamId, winCount] of Object.entries(batch.wins).sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`  ${teamId} wins:      ${String(winCount).padStart(4)}  (${pct(winCount, totalDecided)} of decided games)`);
}
if (batch.draws > 0)              console.log(`  Draws:             ${batch.draws}  (${pct(batch.draws, batch.totalGames)})`);
if (batch.timeouts > 0)           console.log(`  Timeouts:          ${batch.timeouts}  (${pct(batch.timeouts, batch.totalGames)})`);
if (batch.errors > 0)             console.log(`  Errors:            ${batch.errors}  (${pct(batch.errors, batch.totalGames)})`);
if (batch.warningCount > 0)       console.log(`  Warnings:          ${batch.warningCount} total`);
if (batch.totalFailedAttempts > 0) console.log(`  Failed attempts:   ${batch.totalFailedAttempts} total  ⚠ bot picked a move that was rejected at dispatch`);

console.log(`\n  Avg game time:     ${fmtTime(batch.avgGameTimeSeconds)}`);
console.log(`  Min / Max:         ${fmtTime(batch.minGameTimeSeconds)} / ${fmtTime(batch.maxGameTimeSeconds)}`);
console.log(`  Avg actions/game:  ${batch.avgActionsPerGame.toFixed(1)}`);

console.log(`\n  Avg peak tile troops:  ${batch.avgPeakTileTroops.toFixed(1)}`);
console.log(`  Max peak tile troops:  ${batch.maxPeakTileTroops.toFixed(0)}`);

if (batch.timeouts > 0) {
  const soft = batch.timeouts - batch.hardDeadlocks;
  console.log(`\n  Timeout breakdown:`);
  console.log(`    Hard deadlocks:  ${batch.hardDeadlocks}  (${pct(batch.hardDeadlocks, batch.timeouts)} — all players had 0 valid moves)`);
  console.log(`    Soft timeouts:   ${soft}  (${pct(soft, batch.timeouts)} — at least one player could still move)`);
}

if (batch.errorSamples.length > 0) {
  console.log(`\nError samples:`);
  for (const sample of batch.errorSamples) {
    console.log(`  • ${sample}`);
  }
}

// ── Optional replay ───────────────────────────────────────────────────────────

if (doReplay) {
  console.log(`\nRunning replay of last game...`);
  const lastGame = runGame({ playerMode: mode, difficulty, player1Bot, othersBots: botMode });
  console.log(`  Original:  ${fmtTime(lastGame.gameTimeSeconds)}, winner=${lastGame.winner ?? "none"}, ${lastGame.actionCount} actions`);

  const replayed = replayGame(lastGame);
  console.log(`  Replayed:  ${fmtTime(replayed.gameTimeSeconds)}, winner=${replayed.winner ?? "none"}, ${replayed.actionCount} actions replayed`);

  if (replayed.warnings.length > 0) {
    console.log(`  Replay warnings (${replayed.warnings.length}):`);
    for (const w of replayed.warnings.slice(0, 10)) console.log(`    ⚠ ${w}`);
  }

  console.log(`\nAction log (first 30 entries):`);
  for (const entry of lastGame.actionLog.slice(0, 30)) {
    const troopsStr = entry.troopsSent > 0 ? ` ×${entry.troopsSent}` : "";
    console.log(`  t=${String(entry.gameTime.toFixed(1)).padStart(6)}s  ${entry.playerId.padEnd(9)} ${entry.type.padEnd(15)} ${entry.sourceTileId}→${entry.targetTileId}${troopsStr}`);
  }
  if (lastGame.actionLog.length > 30) {
    console.log(`  ... and ${lastGame.actionLog.length - 30} more`);
  }
}

console.log("");
