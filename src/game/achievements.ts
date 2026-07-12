/**
 * achievements.ts — Local, privacy-safe medals checked at the end of a match.
 *
 * Definitions are data + a pure check function; storage lives in stats.ts.
 * checkAndUnlockAchievements runs once from the EndGame screen after the game
 * result has been recorded, so checks can rely on up-to-date career stats.
 */

import { getTerritoriesForMap, getTerritoryController } from "./territories";
import { loadStats, unlockAchievements, type PlayerStats } from "./stats";
import type { GameState, PlayerId } from "./types";

export interface AchievementContext {
  state: GameState;
  won: boolean;
  humanPlayerId: PlayerId;
  /** Career stats AFTER this game was recorded. */
  stats: PlayerStats;
}

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  icon: string; // single emoji, shown in the gallery and unlock toast
  check: (ctx: AchievementContext) => boolean;
}

// True when the player has ever won on the given map (bestTimes only records wins).
function hasWinOnMap(stats: PlayerStats, mapId: string): boolean {
  return Object.keys(stats.bestTimes).some((key) => key.startsWith(`${mapId}|`));
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  {
    id: "first_win",
    name: "First Victory",
    description: "Win your first match.",
    icon: "🏆",
    check: (ctx) => ctx.won,
  },
  {
    id: "wins_5",
    name: "Seasoned Commander",
    description: "Win 5 matches.",
    icon: "⚔️",
    check: (ctx) => ctx.stats.wins >= 5,
  },
  {
    id: "wins_10",
    name: "Veteran",
    description: "Win 10 matches.",
    icon: "🎖️",
    check: (ctx) => ctx.stats.wins >= 10,
  },
  {
    id: "wins_25",
    name: "Warlord",
    description: "Win 25 matches.",
    icon: "👑",
    check: (ctx) => ctx.stats.wins >= 25,
  },
  {
    id: "hard_win",
    name: "Iron Will",
    description: "Win a match on Hard.",
    icon: "🛡️",
    check: (ctx) => ctx.won && ctx.state.ai.difficulty === "hard",
  },
  {
    id: "fast_win",
    name: "Blitz",
    description: "Win in under 2 minutes.",
    icon: "⚡",
    check: (ctx) => ctx.won && ctx.state.now < 120,
  },
  {
    id: "flawless_win",
    name: "Untouchable",
    description: "Win without losing a single tile.",
    icon: "💎",
    check: (ctx) =>
      ctx.won && (ctx.state.players[ctx.humanPlayerId]?.tilesLost ?? 1) === 0,
  },
  {
    id: "comeback_win",
    name: "Phoenix",
    description: "Win a match after losing your capital.",
    icon: "🔥",
    check: (ctx) =>
      ctx.won && (ctx.state.players[ctx.humanPlayerId]?.capitalsLost ?? 0) > 0,
  },
  {
    id: "escrow_reclaim",
    name: "Treasurer",
    description: "Retake your capital in time to reclaim escrowed gold.",
    icon: "💰",
    check: (ctx) => ctx.state.players[ctx.humanPlayerId]?.escrowReclaimed === true,
  },
  {
    id: "all_territories",
    name: "Cartographer",
    description: "Finish a won match controlling every territory.",
    icon: "🗺️",
    check: (ctx) =>
      ctx.won &&
      getTerritoriesForMap(ctx.state.mapId).every(
        (territory) =>
          getTerritoryController(territory, ctx.state.tiles) === ctx.humanPlayerId
      ),
  },
  {
    id: "both_maps",
    name: "World Tour",
    description: "Win on every map.",
    icon: "🌍",
    check: (ctx) =>
      hasWinOnMap(ctx.stats, "river_crown") &&
      hasWinOnMap(ctx.stats, "borderlands") &&
      hasWinOnMap(ctx.stats, "shattered_isles"),
  },
  {
    id: "ffa_win",
    name: "Last One Standing",
    description: "Win a free-for-all against three opponents.",
    icon: "🥇",
    check: (ctx) => ctx.won && ctx.state.playerMode === "1v1v1v1",
  },
  {
    id: "team_win",
    name: "Better Together",
    description: "Win a 2v2 match.",
    icon: "🤝",
    check: (ctx) => ctx.won && ctx.state.playerMode === "2v2",
  },
] as const;

/**
 * Evaluates all achievement checks against the finished match and persists any
 * new unlocks. Returns the definitions that were newly unlocked, for toasts.
 */
export function checkAndUnlockAchievements(params: {
  state: GameState;
  won: boolean;
  humanPlayerId: PlayerId;
}): AchievementDef[] {
  const stats = loadStats();
  const ctx: AchievementContext = { ...params, stats };

  const newlyUnlocked = ACHIEVEMENTS.filter(
    (def) => stats.achievements[def.id] === undefined && def.check(ctx)
  );

  unlockAchievements(newlyUnlocked.map((def) => def.id));
  return newlyUnlocked;
}
