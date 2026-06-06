/**
 * Hud.tsx — The in-game heads-up display overlaid on the canvas.
 *
 * Shows a panel per active player (tiles, troops, gold, income), a territory
 * control bar, the selected-tile summary, the gold escrow warning, the
 * send-fraction selector, and the speed/pause/mute controls.
 *
 * The HUD is pure React (no canvas). It reads GameState on every render and
 * calls handler callbacks to push changes back up to GameScreen.
 */

import { useState } from "react";
import { GOLD_PRODUCTION_PER_SECOND } from "../game/constants";
import { isMuted, toggleMute } from "../game/audio";
import { areAllies, getActivePlayerIds } from "../game/state";
import type { GameState, PlayerId } from "../game/types";

function getTotalTiles(state: GameState): number {
  return Object.keys(state.tiles).length;
}

interface HudProps {
  state: GameState;
  // The viewer is the human player. Other active slots are AI. Defaults to
  // player1 so existing call sites don't need to change.
  playerId?: PlayerId;
  isPaused: boolean;
  speed: number;
  sendFraction: number;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
  onReturnToMenu: () => void;
  onSpeedToggle: () => void;
  onChangeSendFraction: (fraction: number) => void;
}

/** Floors gold to a whole number for display — avoids showing fractional values mid-tick. */
function formatGold(value: number): string {
  return Math.floor(value).toString();
}

/** Total floored troops across all tiles owned by a player. */
function getTotalTroops(state: GameState, playerId: PlayerId): number {
  return Math.floor(
    Object.values(state.tiles)
      .filter((t) => t.owner === playerId)
      .reduce((sum, t) => sum + t.troops, 0)
  );
}

/** Number of tiles currently owned by a player. */
function getTileCount(state: GameState, playerId: PlayerId): number {
  return Object.values(state.tiles).filter((t) => t.owner === playerId).length;
}

/** Gold income rate per second from all capitals and towns a player owns. */
function getGoldRate(state: GameState, playerId: PlayerId): number {
  return Object.values(state.tiles)
    .filter((t) => t.owner === playerId)
    .reduce((sum, t) => {
      const def = state.tileDefinitions[t.id];
      if (!def) return sum;
      if (def.isCapital) return sum + GOLD_PRODUCTION_PER_SECOND.capital;
      if (def.isTown) return sum + GOLD_PRODUCTION_PER_SECOND.town;
      return sum;
    }, 0);
}

/** Aggregate tile count and troop total for all neutral-owned tiles. */
function getNeutralStats(state: GameState): { tiles: number; troops: number } {
  const neutralTiles = Object.values(state.tiles).filter(
    (t) => t.owner === "neutral"
  );
  return {
    tiles: neutralTiles.length,
    troops: Math.floor(neutralTiles.reduce((sum, t) => sum + t.troops, 0)),
  };
}

/**
 * Returns a warning string if the player has gold in escrow (at risk of losing
 * after a capital was taken), or null if there is no active escrow.
 */
function getEscrowText(state: GameState, playerId: PlayerId): string | null {
  const player = state.players[playerId];
  if (!player) return null;

  if (
    player.escrowGold <= 0 ||
    player.escrowCapitalId === null ||
    player.escrowExpiresAt === null
  ) {
    return null;
  }

  const secondsLeft = Math.max(0, player.escrowExpiresAt - state.now);
  return `${Math.ceil(player.escrowGold)} gold at risk — ${Math.ceil(secondsLeft)}s`;
}

// Label for a player panel from the viewer's perspective. Colour is what
// actually disambiguates in FFA modes (each player has a distinct hue), so
// the label can stay short.
function getPanelLabel(
  state: GameState,
  viewerId: PlayerId,
  panelPlayerId: PlayerId
): string {
  if (panelPlayerId === viewerId) return "You";
  if (areAllies(state, panelPlayerId, viewerId)) return "Ally";
  return "Enemy";
}

const FRACTIONS: { value: number; label: string }[] = [
  { value: 0.25, label: "¼" },
  { value: 0.5,  label: "½" },
  { value: 0.75, label: "¾" },
  { value: 1.0,  label: "All" },
];

export function Hud({
  state,
  playerId = "player1",
  isPaused,
  speed,
  sendFraction,
  onPause,
  onResume,
  onReset,
  onReturnToMenu,
  onSpeedToggle,
  onChangeSendFraction,
}: HudProps) {
  const viewer = state.players[playerId];
  const escrowText = getEscrowText(state, playerId);
  const neutral = getNeutralStats(state);

  const [muted, setMuted] = useState(isMuted);

  function handleMuteToggle(): void {
    setMuted(toggleMute());
  }

  const isPlaying = state.phase === "playing";
  const isOver = state.phase !== "playing";
  const totalTiles = getTotalTiles(state);

  // Active players in a fixed order — viewer first, then the rest by id.
  // This keeps the viewer's panel anchored on the left across all modes.
  const allActive = getActivePlayerIds(state);
  const orderedPlayerIds: PlayerId[] = [
    ...(allActive.includes(playerId) ? [playerId] : []),
    ...allActive.filter((id) => id !== playerId),
  ];

  return (
    <div className="hud">
      <div className="hud__top">
        {orderedPlayerIds.map((pid) => {
          const player = state.players[pid];
          if (!player) return null;
          const tiles = getTileCount(state, pid);
          const troops = getTotalTroops(state, pid);
          const goldRate = getGoldRate(state, pid);
          const label = getPanelLabel(state, playerId, pid);
          const teamModeShowChip = state.playerMode === "2v2";
          return (
            <div key={pid} className={`hud__panel hud__panel--${pid}`}>
              <div className="hud__label">
                {label}
                {teamModeShowChip && (
                  <span className={`hud__team-chip hud__team-chip--${player.teamId}`}>
                    {player.teamId === "team1" ? "T1" : "T2"}
                  </span>
                )}
              </div>
              <div className="hud__value">
                Gold {formatGold(player.gold)} / {player.goldCap}
              </div>
              <div className="hud__sub">
                +{goldRate.toFixed(1)}/s · {tiles} tiles
              </div>
              <div className="hud__sub">Troops {troops}</div>
            </div>
          );
        })}

        <div className="hud__panel hud__panel--neutral">
          <div className="hud__label">Neutral</div>
          <div className="hud__value">{neutral.tiles} tiles</div>
          <div className="hud__sub">Troops {neutral.troops}</div>
        </div>
      </div>

      {totalTiles > 0 && (
        <div className="hud__control-bar" aria-label="Territory control">
          {orderedPlayerIds.map((pid) => {
            const tiles = getTileCount(state, pid);
            return (
              <div
                key={pid}
                className={`hud__control-seg hud__control-seg--${pid}`}
                style={{ flex: tiles }}
              />
            );
          })}
          <div
            className="hud__control-seg hud__control-seg--neutral"
            style={{ flex: neutral.tiles }}
          />
        </div>
      )}

      {escrowText && !isPaused && viewer && (
        <div className="hud__warning">{escrowText}</div>
      )}

      {isPaused && !isOver && (
        <div className="hud__pause">
          <div className="hud__pause-card">
            <div className="hud__pause-title">Paused</div>
            <div className="hud__pause-buttons">
              <button type="button" onClick={onResume}>Resume</button>
              <button type="button" onClick={onReset}>Restart</button>
              <button type="button" className="hud__btn--secondary" onClick={onReturnToMenu}>
                Menu
              </button>
            </div>
          </div>
        </div>
      )}

      {isPlaying && (
        <div className="hud__bottom">
          <div className="send-fraction" aria-label="Troops to send">
            {FRACTIONS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                className={`send-fraction__btn${sendFraction === value ? " send-fraction__btn--active" : ""}`}
                onClick={() => onChangeSendFraction(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="hud__bottom-right">
            <button
              type="button"
              className="hud__mute-btn"
              onClick={handleMuteToggle}
              aria-label={muted ? "Unmute" : "Mute"}
            >
              {muted ? "Muted" : "Sound"}
            </button>
            <button
              type="button"
              className={`hud__speed-btn${speed === 2 ? " hud__speed-btn--active" : ""}`}
              onClick={onSpeedToggle}
              aria-label="Toggle game speed"
            >
              {speed === 2 ? "2×" : "1×"}
            </button>
            <button type="button" onClick={isPaused ? onResume : onPause}>
              {isPaused ? "Resume" : "Pause"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
