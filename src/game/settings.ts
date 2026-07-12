/**
 * settings.ts — Small persisted player preferences (localStorage).
 *
 * Currently just the map-theme choice. Winter and autumn are unlockable
 * rewards derived from career stats — no separate unlock storage needed.
 */

import { loadStats, type PlayerStats } from "./stats";
import type { MapTheme } from "./types";

const THEME_KEY = "iron_vale_theme";

export type ThemePreference = "random" | MapTheme;

export function getThemePreference(): ThemePreference {
  const raw = localStorage.getItem(THEME_KEY);
  if (raw === "default" || raw === "winter" || raw === "autumn" || raw === "random") {
    return raw;
  }
  return "random";
}

export function setThemePreference(preference: ThemePreference): void {
  try {
    localStorage.setItem(THEME_KEY, preference);
  } catch {
    // Storage unavailable — the choice just won't persist.
  }
}

/** Human-readable unlock requirement, shown on locked theme buttons. */
export const THEME_UNLOCK_HINTS: Record<MapTheme, string | null> = {
  default: null,
  winter: "Win on Hard",
  autumn: "Win 5 matches",
};

/** True when the given theme is available to the player. */
export function isThemeUnlocked(theme: MapTheme, stats: PlayerStats = loadStats()): boolean {
  switch (theme) {
    case "default":
      return true;
    case "winter":
      // Any hard win on any map (bestTimes only records wins).
      return Object.keys(stats.bestTimes).some((key) => key.endsWith("|hard"));
    case "autumn":
      return stats.wins >= 5;
  }
}

/**
 * Resolves the stored preference to a concrete theme for a new match.
 * "random" rolls among unlocked themes (weighted toward the classic look);
 * a locked explicit choice falls back to default.
 */
export function resolveMapTheme(): MapTheme {
  const preference = getThemePreference();
  const stats = loadStats();

  if (preference !== "random") {
    return isThemeUnlocked(preference, stats) ? preference : "default";
  }

  const roll = Math.random();
  if (roll < 0.7) return "default";
  if (roll < 0.85 && isThemeUnlocked("autumn", stats)) return "autumn";
  if (isThemeUnlocked("winter", stats)) return "winter";
  return "default";
}
