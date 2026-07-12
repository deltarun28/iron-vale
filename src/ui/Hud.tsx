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
import { TROOP_PRODUCTION_PER_SECOND } from "../game/constants";
import { isMuted, toggleMute } from "../game/audio";
import { areAllies, getActivePlayerIds, isPlayer } from "../game/state";
import { getTerritoriesForMap, getTerritoryBonus, getTerritoryController } from "../game/territories";
import type { GameState, OwnerId, PlayerId } from "../game/types";

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
  onSpeedChange: (speed: 0.5 | 1 | 1.5 | 2) => void;
  onChangeSendFraction: (fraction: number) => void;
}

/** Floors gold to a whole number for display — avoids showing fractional values mid-tick. */
function formatGold(value: number): string {
  return Math.floor(value).toString();
}

/** Per-owner tile/troop/production totals for the stat panels. */
interface OwnerStats {
  tiles: number;
  troops: number;
  /** Troops/s from terrain production; excludes territory bonuses. */
  baseRate: number;
}

// Builds every panel's numbers in one pass over the tiles instead of
// re-filtering per stat per player — this runs every frame at game speed.
function aggregateOwnerStats(state: GameState): Map<OwnerId, OwnerStats> {
  const stats = new Map<OwnerId, OwnerStats>();
  for (const tile of Object.values(state.tiles)) {
    let entry = stats.get(tile.owner);
    if (!entry) {
      entry = { tiles: 0, troops: 0, baseRate: 0 };
      stats.set(tile.owner, entry);
    }
    entry.tiles += 1;
    entry.troops += tile.troops;

    const def = state.tileDefinitions[tile.id];
    if (def && isPlayer(tile.owner)) {
      entry.baseRate += def.isCapital
        ? TROOP_PRODUCTION_PER_SECOND.capital
        : TROOP_PRODUCTION_PER_SECOND[def.terrain];
    }
  }
  return stats;
}

/** Flat territory bonus (troops/s per owned tile) each player currently earns. */
function getTerritoryBonusPerTile(state: GameState): Map<PlayerId, number> {
  const bonuses = new Map<PlayerId, number>();
  for (const territory of getTerritoriesForMap(state.mapId)) {
    const controller = getTerritoryController(territory, state.tiles);
    if (controller !== null) {
      bonuses.set(
        controller,
        (bonuses.get(controller) ?? 0) + getTerritoryBonus(territory)
      );
    }
  }
  return bonuses;
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
  onSpeedChange,
  onChangeSendFraction,
}: HudProps) {
  const viewer = state.players[playerId];
  const escrowText = getEscrowText(state, playerId);
  const ownerStats = aggregateOwnerStats(state);
  const territoryBonuses = getTerritoryBonusPerTile(state);
  const neutral = ownerStats.get("neutral") ?? { tiles: 0, troops: 0, baseRate: 0 };

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
          const stats = ownerStats.get(pid) ?? { tiles: 0, troops: 0, baseRate: 0 };
          const tiles = stats.tiles;
          const troops = Math.floor(stats.troops);
          // Territory bonus applies per owned tile for each controlled territory.
          const troopRate = stats.baseRate + (territoryBonuses.get(pid) ?? 0) * stats.tiles;
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
                +{troopRate.toFixed(1)} t/s · {tiles} tiles
              </div>
              <div className="hud__sub">Troops {troops}</div>
            </div>
          );
        })}

        <div className="hud__panel hud__panel--neutral">
          <div className="hud__label">Neutral</div>
          <div className="hud__value">{neutral.tiles} tiles</div>
          <div className="hud__sub">Troops {Math.floor(neutral.troops)}</div>
        </div>
      </div>

      {totalTiles > 0 && (
        <div className="hud__control-bar" aria-label="Territory control">
          {orderedPlayerIds.map((pid) => (
            <div
              key={pid}
              className={`hud__control-seg hud__control-seg--${pid}`}
              style={{ flex: ownerStats.get(pid)?.tiles ?? 0 }}
            />
          ))}
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
              className={`hud__speed-btn${speed !== 1 ? " hud__speed-btn--active" : ""}`}
              onClick={() => {
                const cycle: (0.5 | 1 | 1.5 | 2)[] = [0.5, 1, 1.5, 2];
                const next = cycle[(cycle.indexOf(speed as 0.5 | 1 | 1.5 | 2) + 1) % cycle.length]!;
                onSpeedChange(next);
              }}
              aria-label="Cycle game speed"
            >
              {speed === 0.5 ? "½×" : speed === 1.5 ? "1½×" : `${speed}×`}
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
