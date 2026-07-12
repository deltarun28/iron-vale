/**
 * testFixtures.ts — Hand-built minimal game states for unit tests.
 *
 * Deliberately independent of the real map data so tests don't break when the
 * maps are rebalanced. The fixture map is four tiles:
 *
 *   cap1      — player1's capital, coastal
 *   field1    — player1 plains
 *   field2    — neutral plains, coastal
 *   enemy_cap — player2's capital, coastal
 *
 * One bidirectional sea lane connects cap1 ↔ enemy_cap.
 */

import { createInitialPlayerState } from "./state";
import type {
  GameState,
  OwnerId,
  TileDefinition,
  TileState,
} from "./types";

export function makeDef(
  id: string,
  over: Partial<TileDefinition> = {}
): TileDefinition {
  return {
    id,
    name: id,
    terrain: "plains",
    startingOwner: "neutral",
    startingTroops: 3,
    isCapital: false,
    isTown: false,
    coastal: false,
    adjacent: [],
    coord: { q: 0, r: 0 },
    ...over,
  };
}

export function makeTile(
  id: string,
  owner: OwnerId,
  troops: number,
  over: Partial<TileState> = {}
): TileState {
  return {
    id,
    owner,
    troops,
    busyUntil: null,
    embarkCooldownUntil: null,
    goldFrozenUntil: null,
    fortLevel: 0,
    armoured: false,
    attackVetLevel: 0,
    defVetLevel: 0,
    ...over,
  };
}

export function makeTestState(over: Partial<GameState> = {}): GameState {
  const tileDefinitions: Record<string, TileDefinition> = {
    cap1: makeDef("cap1", {
      isCapital: true,
      coastal: true,
      adjacent: ["field1", "field2"],
      coord: { q: 0, r: 0 },
    }),
    field1: makeDef("field1", {
      adjacent: ["cap1", "field2", "enemy_cap"],
      coord: { q: 1, r: 0 },
    }),
    field2: makeDef("field2", {
      coastal: true,
      adjacent: ["cap1", "field1", "enemy_cap"],
      coord: { q: 0, r: 1 },
    }),
    enemy_cap: makeDef("enemy_cap", {
      isCapital: true,
      coastal: true,
      adjacent: ["field1", "field2"],
      coord: { q: 1, r: 1 },
    }),
  };

  const tiles: Record<string, TileState> = {
    cap1: makeTile("cap1", "player1", 10),
    field1: makeTile("field1", "player1", 8),
    field2: makeTile("field2", "neutral", 3),
    enemy_cap: makeTile("enemy_cap", "player2", 10),
  };

  return {
    phase: "playing",
    winningTeam: null,
    playerMode: "1v1",
    mapId: "river_crown",
    mapTheme: "default",
    capitalTileIds: ["cap1", "enemy_cap"],
    now: 0,
    tiles,
    tileDefinitions,
    seaLanes: [
      { id: "lane1", from: "cap1", to: "enemy_cap", distance: 3, bidirectional: true },
    ],
    players: {
      player1: createInitialPlayerState("player1", "team1", 1),
      player2: createInitialPlayerState("player2", "team2", 1),
    },
    activeActions: [],
    combatEvents: [],
    timeline: [],
    ai: {
      difficulty: "normal",
      lastThinkAt: 0,
      nextThinkAt: 1,
      byPlayer: {
        player2: { stance: "balanced", stanceChangedAt: 0 },
      },
    },
    lastNeutralAggressionAt: 0,
    lastNeutralFortifyAt: 0,
    ...over,
  };
}
