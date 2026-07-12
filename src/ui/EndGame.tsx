import { useState } from "react";
import { asset } from "../assets";
import { checkAndUnlockAchievements } from "../game/achievements";
import { getActivePlayerIds, getTeamId } from "../game/state";
import { loadStats, recordGameResult } from "../game/stats";
import type { GameState, PlayerId } from "../game/types";
import { MatchTimeline } from "./MatchTimeline";

interface EndGameProps {
  state: GameState;
  humanPlayerId?: PlayerId;
  onPlayAgain: () => void;
  onMenu: () => void;
}

const PLAYER_COLORS: Record<PlayerId, string> = {
  player1: "#3A6EA5",
  player2: "#A23B3B",
  player3: "#4F6F52",
  player4: "#B08D57",
};

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function EndGame({
  state,
  humanPlayerId = "player1",
  onPlayAgain,
  onMenu,
}: EndGameProps) {
  const humanTeam = getTeamId(state, humanPlayerId);
  const won = state.winningTeam !== null && state.winningTeam === humanTeam;

  // Record this game and snapshot the updated career stats on first render.
  // useState lazy init runs once on mount so the result is recorded exactly once.
  // Achievements are checked after recording so career-count medals see this game.
  const [{ career, isNewBest, unlocked }] = useState(() => {
    const newBest = recordGameResult(won, state.now, state.mapId, state.ai.difficulty, state.playerMode);
    const newlyUnlocked = checkAndUnlockAchievements({ state, won, humanPlayerId });
    return { career: loadStats(), isNewBest: newBest, unlocked: newlyUnlocked };
  });

  const activeIds = getActivePlayerIds(state);
  const allies = activeIds.filter(
    (id) => id !== humanPlayerId && getTeamId(state, id) === humanTeam
  );
  const enemies = activeIds.filter((id) => getTeamId(state, id) !== humanTeam);

  // Display order: you → allies → enemies. Enemies are visually separated
  // in team modes so you can tell at a glance which side did what.
  const orderedIds: PlayerId[] = [humanPlayerId, ...allies, ...enemies];
  const myTeamSize = 1 + allies.length;
  const isTeamMode = allies.length > 0;

  function playerLabel(id: PlayerId): string {
    if (id === humanPlayerId) return "You";
    if (getTeamId(state, id) === humanTeam) return "Ally";
    return "CPU";
  }

  function isWinner(id: PlayerId): boolean {
    return state.winningTeam !== null && getTeamId(state, id) === state.winningTeam;
  }

  function peakTiles(id: PlayerId): number {
    return state.players[id]?.peakTilesHeld ?? 0;
  }
  function troops(id: PlayerId): number {
    return Math.floor(state.players[id]?.totalTroopsProduced ?? 0);
  }
  function gold(id: PlayerId): number {
    return Math.floor(state.players[id]?.totalGoldEarned ?? 0);
  }

  const statRows = [
    { label: "Peak tiles", fn: peakTiles },
    { label: "Troops made", fn: troops },
    { label: "Gold earned", fn: gold },
  ];

  // One column per player, label column takes remaining space.
  const gridCols = `1fr ${orderedIds.map(() => "auto").join(" ")}`;

  return (
    <div className={`end-game${won ? " end-game--won" : " end-game--lost"}`}>
      <div className="end-game__panel">

        <img
          src={asset("icon.png")}
          alt="Iron Vale"
          className={`end-game__emblem${won ? "" : " end-game__emblem--defeat"}`}
        />

        <div className="end-game__headline">
          <div className={`end-game__result${won ? " end-game__result--won" : " end-game__result--lost"}`}>
            {won ? "Victory" : "Defeated"}
          </div>
          <div className="end-game__subtitle">
            {won ? "Iron Vale is yours" : "Iron Vale has fallen"}
          </div>
        </div>

        <div className="end-game__time">
          {won ? "Conquered in" : "Held for"} {formatDuration(state.now)}
        </div>

        <div className={`end-game__career${isNewBest ? " end-game__career--best" : ""}`}>
          {career.wins}W · {career.gamesPlayed}G
          {isNewBest && career.fastestWin !== null && (
            <> · New best: {formatDuration(career.fastestWin)}</>
          )}
          {!isNewBest && career.fastestWin !== null && (
            <> · Best: {formatDuration(career.fastestWin)}</>
          )}
        </div>

        {unlocked.length > 0 && (
          <div className="end-game__achievements">
            {unlocked.map((def) => (
              <div key={def.id} className="end-game__achievement">
                <span className="end-game__achievement-icon">{def.icon}</span>
                <span className="end-game__achievement-text">
                  <strong>{def.name}</strong> — {def.description}
                </span>
              </div>
            ))}
          </div>
        )}

        <MatchTimeline state={state} humanPlayerId={humanPlayerId} />

        <div className="end-game__divider" />

        <div className="end-game__stats">
          {/* Player header row */}
          <div className="end-game__stat-row" style={{ gridTemplateColumns: gridCols }}>
            <span />
            {orderedIds.map((id, i) => (
              <div
                key={id}
                className={[
                  "end-game__player-col",
                  isTeamMode && i === myTeamSize ? "end-game__player-col--enemy-start" : "",
                ].filter(Boolean).join(" ")}
              >
                <span
                  className="end-game__player-dot"
                  style={{ background: PLAYER_COLORS[id] }}
                />
                <span className="end-game__player-name">{playerLabel(id)}</span>
              </div>
            ))}
          </div>

          {/* One row per stat */}
          {statRows.map(({ label, fn }) => (
            <div
              key={label}
              className="end-game__stat-row"
              style={{ gridTemplateColumns: gridCols }}
            >
              <span className="end-game__stat-label">{label}</span>
              {orderedIds.map((id, i) => (
                <span
                  key={id}
                  className={[
                    "end-game__stat-val",
                    isWinner(id) ? "end-game__stat-val--winning" : "",
                    isTeamMode && i === myTeamSize ? "end-game__player-col--enemy-start" : "",
                  ].filter(Boolean).join(" ")}
                >
                  {fn(id)}
                </span>
              ))}
            </div>
          ))}
        </div>

        <div className="end-game__divider" />

        <div className="end-game__actions">
          <button type="button" className="end-game__btn" onClick={onPlayAgain}>
            {won ? "Play again" : "Try again"}
          </button>
          <button type="button" className="end-game__btn end-game__btn--secondary" onClick={onMenu}>
            Main menu
          </button>
        </div>

      </div>
    </div>
  );
}
