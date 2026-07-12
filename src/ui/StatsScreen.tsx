/**
 * StatsScreen.tsx — Career stats overlay shown from the main menu.
 *
 * Displays win/loss form for the last 10 games, best win times per
 * map and difficulty, and overall averages. Tapping outside closes it.
 */

import { ACHIEVEMENTS } from "../game/achievements";
import { loadStats } from "../game/stats";
import type { Difficulty, MapId } from "../game/types";

interface StatsScreenProps {
  onClose: () => void;
}

const MAPS: { id: MapId; label: string }[] = [
  { id: "river_crown", label: "River Crown" },
  { id: "borderlands", label: "Borderlands" },
];

const DIFFICULTIES: { id: Difficulty; label: string }[] = [
  { id: "easy", label: "Easy" },
  { id: "normal", label: "Normal" },
  { id: "hard", label: "Hard" },
];

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function StatsScreen({ onClose }: StatsScreenProps) {
  const stats = loadStats();

  const recentWins = stats.recentGames.filter((g) => g.won).length;
  const recentTotal = stats.recentGames.length;

  const avgTime =
    stats.gamesPlayed > 0
      ? stats.totalDurationSeconds / stats.gamesPlayed
      : null;

  const overallWinPct =
    stats.gamesPlayed > 0
      ? Math.round((stats.wins / stats.gamesPlayed) * 100)
      : null;

  return (
    <div className="how-to-play" onClick={onClose}>
      <div className="how-to-play__panel" onClick={(e) => e.stopPropagation()}>
        <div className="how-to-play__header">
          <h2 className="how-to-play__title">Stats</h2>
          <button type="button" className="how-to-play__close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="how-to-play__body">

          {stats.gamesPlayed === 0 ? (
            <p className="stats-screen__empty">No games played yet. Get out there!</p>
          ) : (
            <>
              {/* Recent form */}
              <section className="how-to-play__section">
                <h3>Recent Form</h3>
                <div className="stats-screen__form">
                  {stats.recentGames.map((g, i) => (
                    <span
                      key={i}
                      className={`stats-screen__dot stats-screen__dot--${g.won ? "win" : "loss"}`}
                      title={`${g.won ? "Win" : "Loss"} · ${g.mapId.replace("_", " ")} · ${g.difficulty} · ${formatTime(g.durationSeconds)}`}
                    />
                  ))}
                  {stats.recentGames.length < 10 &&
                    Array.from({ length: 10 - stats.recentGames.length }).map((_, i) => (
                      <span key={`empty-${i}`} className="stats-screen__dot stats-screen__dot--empty" />
                    ))}
                </div>
                {recentTotal > 0 && (
                  <p className="stats-screen__form-label">
                    {recentWins}W · {recentTotal - recentWins}L in last {recentTotal} {recentTotal === 1 ? "game" : "games"}
                  </p>
                )}
              </section>

              {/* Best win times */}
              <section className="how-to-play__section">
                <h3>Best Win Times</h3>
                <div className="stats-screen__table">
                  <div className="stats-screen__table-row stats-screen__table-row--header">
                    <span />
                    {DIFFICULTIES.map((d) => (
                      <span key={d.id} className="stats-screen__th">{d.label}</span>
                    ))}
                  </div>
                  {MAPS.map((m) => (
                    <div key={m.id} className="stats-screen__table-row">
                      <span className="stats-screen__map-label">{m.label}</span>
                      {DIFFICULTIES.map((d) => {
                        const key = `${m.id}|${d.id}`;
                        const t = stats.bestTimes[key];
                        return (
                          <span key={d.id} className={`stats-screen__td${t !== undefined ? " stats-screen__td--set" : ""}`}>
                            {t !== undefined ? formatTime(t) : "—"}
                          </span>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </section>

              {/* Achievements */}
              <section className="how-to-play__section">
                <h3>
                  Achievements
                  <span className="stats-screen__ach-count">
                    {" "}
                    {Object.keys(stats.achievements).length}/{ACHIEVEMENTS.length}
                  </span>
                </h3>
                <div className="stats-screen__achievements">
                  {ACHIEVEMENTS.map((def) => {
                    const isUnlocked = stats.achievements[def.id] !== undefined;
                    return (
                      <div
                        key={def.id}
                        className={`stats-screen__ach${isUnlocked ? "" : " stats-screen__ach--locked"}`}
                        title={def.description}
                      >
                        <span className="stats-screen__ach-icon">
                          {isUnlocked ? def.icon : "🔒"}
                        </span>
                        <span className="stats-screen__ach-body">
                          <span className="stats-screen__ach-name">{def.name}</span>
                          <span className="stats-screen__ach-desc">{def.description}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Overall */}
              <section className="how-to-play__section">
                <h3>Overall</h3>
                <div className="stats-screen__summary">
                  <div className="stats-screen__summary-row">
                    <span className="stats-screen__summary-label">Games played</span>
                    <span className="stats-screen__summary-val">{stats.gamesPlayed}</span>
                  </div>
                  <div className="stats-screen__summary-row">
                    <span className="stats-screen__summary-label">Wins</span>
                    <span className="stats-screen__summary-val">
                      {stats.wins}
                      {overallWinPct !== null && (
                        <span className="stats-screen__summary-sub"> ({overallWinPct}%)</span>
                      )}
                    </span>
                  </div>
                  {avgTime !== null && (
                    <div className="stats-screen__summary-row">
                      <span className="stats-screen__summary-label">Avg game time</span>
                      <span className="stats-screen__summary-val">{formatTime(avgTime)}</span>
                    </div>
                  )}
                  {stats.fastestWin !== null && (
                    <div className="stats-screen__summary-row">
                      <span className="stats-screen__summary-label">Fastest win</span>
                      <span className="stats-screen__summary-val stats-screen__summary-val--best">
                        {formatTime(stats.fastestWin)}
                      </span>
                    </div>
                  )}
                </div>
              </section>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
