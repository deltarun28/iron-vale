/**
 * stats.ts — Persistent career stats stored in localStorage.
 *
 * Tracks games played, wins, fastest win times per game type, recent game
 * history, and total game duration across sessions. Unknown fields are ignored
 * on load so future additions won't break existing saves.
 */

const STATS_KEY = "iron_vale_stats";
const MAX_RECENT_GAMES = 10;

export interface GameRecord {
  won: boolean;
  durationSeconds: number;
  mapId: string;
  difficulty: string;
  playerMode: string;
  timestamp: number;
}

export interface PlayerStats {
  gamesPlayed: number;
  wins: number;
  /** Fastest win ever across all game types. Null until the first win. */
  fastestWin: number | null;
  /** Best win time per game type. Key: `${mapId}|${difficulty}`. */
  bestTimes: Record<string, number>;
  /** Up to 10 most recent games, newest first. */
  recentGames: GameRecord[];
  /** Sum of all game durations for computing average. */
  totalDurationSeconds: number;
  /** Unlocked achievement ids → unlock timestamp (ms). */
  achievements: Record<string, number>;
}

function defaults(): PlayerStats {
  return {
    gamesPlayed: 0,
    wins: 0,
    fastestWin: null,
    bestTimes: {},
    recentGames: [],
    totalDurationSeconds: 0,
    achievements: {},
  };
}

export function loadStats(): PlayerStats {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return defaults();
    const p = JSON.parse(raw) as Partial<PlayerStats>;
    return {
      gamesPlayed: typeof p.gamesPlayed === "number" ? p.gamesPlayed : 0,
      wins: typeof p.wins === "number" ? p.wins : 0,
      fastestWin: typeof p.fastestWin === "number" ? p.fastestWin : null,
      bestTimes:
        typeof p.bestTimes === "object" && p.bestTimes !== null
          ? (p.bestTimes as Record<string, number>)
          : {},
      recentGames: Array.isArray(p.recentGames)
        ? (p.recentGames as GameRecord[])
        : [],
      totalDurationSeconds:
        typeof p.totalDurationSeconds === "number" ? p.totalDurationSeconds : 0,
      achievements:
        typeof p.achievements === "object" && p.achievements !== null
          ? (p.achievements as Record<string, number>)
          : {},
    };
  } catch {
    return defaults();
  }
}

function saveStats(stats: PlayerStats): void {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch {
    // Storage full or unavailable — ignore silently.
  }
}

/**
 * Records the result of a completed game and persists the updated stats.
 * Returns true if this was a new personal best win time for any game type.
 */
export function recordGameResult(
  won: boolean,
  durationSeconds: number,
  mapId: string,
  difficulty: string,
  playerMode: string,
): boolean {
  const stats = loadStats();

  stats.gamesPlayed += 1;
  stats.totalDurationSeconds += durationSeconds;

  const record: GameRecord = {
    won,
    durationSeconds,
    mapId,
    difficulty,
    playerMode,
    timestamp: Date.now(),
  };
  stats.recentGames = [record, ...stats.recentGames].slice(0, MAX_RECENT_GAMES);

  let newBest = false;
  if (won) {
    stats.wins += 1;

    if (stats.fastestWin === null || durationSeconds < stats.fastestWin) {
      stats.fastestWin = durationSeconds;
      newBest = true;
    }

    const key = `${mapId}|${difficulty}`;
    if (stats.bestTimes[key] === undefined || durationSeconds < stats.bestTimes[key]!) {
      stats.bestTimes[key] = durationSeconds;
      newBest = true;
    }
  }

  saveStats(stats);
  return newBest;
}

/** Persists newly unlocked achievement ids with the current timestamp. */
export function unlockAchievements(ids: string[]): void {
  if (ids.length === 0) return;
  const stats = loadStats();
  const now = Date.now();
  for (const id of ids) {
    if (stats.achievements[id] === undefined) stats.achievements[id] = now;
  }
  saveStats(stats);
}
