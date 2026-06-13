/**
 * stats.ts — Persistent career stats stored in localStorage.
 *
 * Tracks games played, wins, and fastest victory time across sessions.
 * The schema is intentionally simple and version-free: unknown fields are
 * ignored on load, so future additions won't break existing saves.
 */

const STATS_KEY = "iron_vale_stats";

export interface PlayerStats {
  gamesPlayed: number;
  wins: number;
  /** Fastest win in game-seconds (state.now at the moment of victory). Null until the first win. */
  fastestWin: number | null;
}

function defaults(): PlayerStats {
  return { gamesPlayed: 0, wins: 0, fastestWin: null };
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
 * Returns true if this was a new personal best win time.
 */
export function recordGameResult(won: boolean, durationSeconds: number): boolean {
  const stats = loadStats();
  stats.gamesPlayed += 1;
  let newBest = false;
  if (won) {
    stats.wins += 1;
    if (stats.fastestWin === null || durationSeconds < stats.fastestWin) {
      stats.fastestWin = durationSeconds;
      newBest = true;
    }
  }
  saveStats(stats);
  return newBest;
}
