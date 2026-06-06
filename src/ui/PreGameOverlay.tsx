/**
 * PreGameOverlay.tsx — 4-second preview shown before play begins.
 *
 * Displays a team summary (your side vs. enemies with coloured player chips)
 * and a 3→2→1 countdown. The overlay disappears when the countdown hits zero
 * and the game phase transitions from "preview" to "playing". The game state
 * is frozen during preview — this component is purely informational.
 */

import { getActivePlayerIds } from "../game/state";
import type { GameState, PlayerId } from "../game/types";

const PLAYER_COLORS: Record<PlayerId, string> = {
  player1: "#3A6EA5",
  player2: "#A23B3B",
  player3: "#4F6F52",
  player4: "#B08D57",
};

interface Props {
  state: GameState;
  secondsLeft: number | null;
}

function PlayerChip({ playerId, label }: { playerId: PlayerId; label: string }) {
  return (
    <span className="pregame__player">
      <span
        className="pregame__dot"
        style={{ background: PLAYER_COLORS[playerId] }}
      />
      {label}
    </span>
  );
}

export function PreGameOverlay({ state, secondsLeft }: Props) {
  const activeIds = getActivePlayerIds(state);
  const isTeamMode = state.playerMode === "2v2";

  const myTeam = state.players["player1"]?.teamId;
  const allies = activeIds.filter(
    (id) => id !== "player1" && state.players[id]?.teamId === myTeam
  );
  const enemies = activeIds.filter(
    (id) => state.players[id]?.teamId !== myTeam
  );

  return (
    <div className="pregame">
      <div className="pregame__panel">
        <div className="pregame__teams">
          {/* Your side */}
          <div className="pregame__side">
            <span className="pregame__side-label">
              {isTeamMode ? "Your Team" : "You"}
            </span>
            <div className="pregame__players">
              <PlayerChip playerId="player1" label="You" />
              {allies.map((id) => (
                <PlayerChip key={id} playerId={id} label="Ally" />
              ))}
            </div>
          </div>

          <span className="pregame__vs">VS</span>

          {/* Enemy side */}
          <div className="pregame__side">
            <span className="pregame__side-label">
              {enemies.length > 1 ? "Enemies" : "Enemy"}
            </span>
            <div className="pregame__players">
              {enemies.map((id) => (
                <PlayerChip key={id} playerId={id} label="CPU" />
              ))}
            </div>
          </div>
        </div>

        <div className="pregame__countdown">
          {secondsLeft !== null ? secondsLeft : ""}
        </div>
      </div>
    </div>
  );
}
