#!/usr/bin/env tsx
/**
 * goldStats.ts — Measures the AI's actual gold economy by ticking games
 * directly and diffing state: gold earned vs spent, fort levels built, and
 * armour purchases. Run before/after balance changes and compare.
 *
 * Usage: npx tsx scripts/goldStats.ts [count] [difficulty] [mapId]
 */

import { updateAI } from "../src/game/ai";
import { updateGame } from "../src/game/simulation";
import { createInitialGameState } from "../src/game/state";
import type { Difficulty, GameState, MapId } from "../src/game/types";

const count = parseInt(process.argv[2] ?? "30", 10);
const difficulty = (process.argv[3] ?? "hard") as Difficulty;
const mapId = (process.argv[4] ?? "river_crown") as MapId;

const AI_ID = "player2" as const;
const TICK = 0.05;
const MAX_SECONDS = 420;

let totals = { earned: 0, spent: 0, fortLevels: 0, armours: 0, time: 0 };

for (let i = 0; i < count; i++) {
  let state: GameState = createInitialGameState(difficulty, "1v1", mapId);
  state = { ...state, phase: "playing" };

  let prev = state;
  while (state.phase === "playing" && state.now < MAX_SECONDS) {
    state = updateAI(updateGame(state, TICK));

    const prevAI = prev.players[AI_ID]!;
    const nextAI = state.players[AI_ID]!;
    // Production only raises gold; any decrease is a purchase (escrow losses
    // only occur on capital loss, which the idle player1 never causes).
    if (nextAI.gold < prevAI.gold) totals.spent += prevAI.gold - nextAI.gold;

    for (const [id, tile] of Object.entries(state.tiles)) {
      const prevTile = prev.tiles[id];
      if (!prevTile || tile.owner !== AI_ID || prevTile.owner !== AI_ID) continue;
      // Fort built this tick (+1 on an owned tile; captures only reduce).
      if (tile.fortLevel > prevTile.fortLevel) totals.fortLevels += tile.fortLevel - prevTile.fortLevel;
      // Armour purchase: flipped on without troops arriving (arrivals deposit troops).
      if (tile.armoured && !prevTile.armoured && tile.troops <= prevTile.troops + 0.5) totals.armours += 1;
    }
    prev = state;
  }
  totals.earned += state.players[AI_ID]!.totalGoldEarned;
  totals.time += state.now;
}

const per = (n: number) => (n / count).toFixed(1);
console.log(`map=${mapId} difficulty=${difficulty} games=${count} avgTime=${per(totals.time)}s`);
console.log(`gold earned/game:  ${per(totals.earned)}`);
console.log(`gold spent/game:   ${per(totals.spent)}  (${((totals.spent / Math.max(1, totals.earned)) * 100).toFixed(0)}% of earned)`);
console.log(`fort levels/game:  ${per(totals.fortLevels)}  (${per(totals.fortLevels * 5)}g)`);
console.log(`armour buys/game:  ${per(totals.armours)}  (${per(totals.armours * 5)}g)`);
