/**
 * TileOptionsPanel.tsx — The info and upgrade panel shown when a player taps a tile.
 *
 * Displays static definition data (terrain, type) alongside live tile state
 * (owner, troops, fort level, veteran levels) and offers Fortify/Armour buttons
 * if the tile is owned by the viewer and they can afford the upgrade.
 */

import {
  ARMOUR,
  FORT,
  GOLD_PRODUCTION_PER_SECOND,
  NEUTRAL_MAX_TROOPS,
  PRODUCTION_CAPS,
  TROOP_PRODUCTION_PER_SECOND,
} from "../game/constants";
import { areAllies, isPlayer } from "../game/state";
import type { GameState, OwnerId, PlayerId, TerrainType } from "../game/types";

interface TileOptionsPanelProps {
  state: GameState;
  tileId: string;
  playerId?: string;
  onClose: () => void;
  onFortify: (tileId: string) => void;
  onArmour: (tileId: string) => void;
}

const TERRAIN_LABEL: Record<TerrainType, string> = {
  plains: "Plains",
  forest: "Forest",
  mountain: "Mountain",
};

/**
 * Returns a human-readable "1 every Xs" production rate for the tile's terrain.
 * Neutral tiles produce at a slower rate and get a special label to signal that.
 */
function getTroopRateLabel(terrain: TerrainType, isCapital: boolean, isNeutral: boolean): string {
  if (isNeutral) return "none (neutral)";
  const rate = isCapital
    ? TROOP_PRODUCTION_PER_SECOND.capital
    : terrain === "plains"
      ? TROOP_PRODUCTION_PER_SECOND.plains
      : terrain === "forest"
        ? TROOP_PRODUCTION_PER_SECOND.forest
        : TROOP_PRODUCTION_PER_SECOND.mountain;
  return `1 every ${Math.round(1 / rate)}s`;
}

/** Returns the gold income rate label for a capital or town, or null for plain territories. */
function getGoldRateLabel(isCapital: boolean, isTown: boolean): string | null {
  if (isCapital) return `+${(GOLD_PRODUCTION_PER_SECOND.capital).toFixed(2)}/s`;
  if (isTown) return `+${(GOLD_PRODUCTION_PER_SECOND.town).toFixed(2)}/s`;
  return null;
}

// Owner labels are team-aware so the panel reads the same whether you face
// one enemy, three enemies, or have a teammate on the field. Determined per
// render rather than baked into a static Record because team layout varies
// by mode.
function getOwnerLabel(
  state: GameState,
  owner: OwnerId,
  viewerId: PlayerId
): string {
  if (owner === "neutral") return "Neutral";
  if (owner === viewerId) return "You";
  if (isPlayer(owner) && areAllies(state, owner, viewerId)) return "Ally";
  return "Enemy";
}

export function TileOptionsPanel({
  state,
  tileId,
  playerId = "player1",
  onClose,
  onFortify,
  onArmour,
}: TileOptionsPanelProps) {
  const tile = state.tiles[tileId];
  const definition = state.tileDefinitions[tileId];

  if (!tile || !definition) {
    return null;
  }

  const viewerId = playerId as PlayerId;
  const isOwned = tile.owner === viewerId;
  const isBusy = tile.busyUntil !== null && tile.busyUntil > state.now;
  const playerGold = state.players[viewerId]?.gold ?? 0;

  const canFortify = isOwned && tile.fortLevel < FORT.MAX_LEVEL && !isBusy && playerGold >= FORT.GOLD_COST_PER_LEVEL;
  const canArmour = isOwned && !tile.armoured && playerGold >= ARMOUR.GOLD_COST;

  const tileType = definition.isCapital
    ? "Capital"
    : definition.isTown
      ? "Town"
      : "Territory";

  return (
    <div className="tile-options">
      <div className="tile-options__header">
        <span className="tile-options__name">{definition.name}</span>
        <button
          className="tile-options__close"
          onClick={onClose}
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div className="tile-options__info">
        <div className="tile-options__row">
          <span className="tile-options__label">Type</span>
          <span className="tile-options__value">{tileType}</span>
        </div>
        <div className="tile-options__row">
          <span className="tile-options__label">Terrain</span>
          <span className="tile-options__value">
            {TERRAIN_LABEL[definition.terrain]}
          </span>
        </div>
        <div className="tile-options__row">
          <span className="tile-options__label">Owner</span>
          <span className="tile-options__value">{getOwnerLabel(state, tile.owner, viewerId)}</span>
        </div>
        <div className="tile-options__row">
          <span className="tile-options__label">Troops</span>
          <span className="tile-options__value">{Math.floor(tile.troops)}</span>
        </div>
        <div className="tile-options__row">
          <span className="tile-options__label">Regen</span>
          <span className="tile-options__value">
            {isBusy
              ? "paused (busy)"
              : getTroopRateLabel(definition.terrain, definition.isCapital, tile.owner === "neutral")}
          </span>
        </div>
        <div className="tile-options__row">
          <span className="tile-options__label">Capacity</span>
          <span className="tile-options__value">
            {(() => {
              const cap = tile.owner === "neutral"
                ? NEUTRAL_MAX_TROOPS
                : PRODUCTION_CAPS[definition.isCapital ? "capital" : definition.terrain].stopsAt;
              const nearCap = tile.troops >= cap * 0.85;
              return (
                <>
                  {Math.floor(tile.troops)} / {cap}
                  {nearCap && tile.owner !== "neutral" && " · regen slowing"}
                </>
              );
            })()}
          </span>
        </div>
        {getGoldRateLabel(definition.isCapital, definition.isTown) !== null && tile.owner !== "neutral" && (
          <div className="tile-options__row">
            <span className="tile-options__label">Gold</span>
            <span className="tile-options__value">{getGoldRateLabel(definition.isCapital, definition.isTown)}</span>
          </div>
        )}
        {tile.fortLevel > 0 && (
          <div className="tile-options__row">
            <span className="tile-options__label">Fort level</span>
            <span className="tile-options__value">
              {tile.fortLevel} / {FORT.MAX_LEVEL} · +{Math.round(tile.fortLevel * FORT.DEFENCE_BONUS_PER_LEVEL * 100)}% def
            </span>
          </div>
        )}
        {tile.armoured && (
          <div className="tile-options__row">
            <span className="tile-options__label">Armoured</span>
            <span className="tile-options__value">+25% combat</span>
          </div>
        )}
        {tile.attackVetLevel > 0 && (
          <div className="tile-options__row">
            <span className="tile-options__label">Attack vets</span>
            <span className="tile-options__value">
              Lv {tile.attackVetLevel} · +{tile.attackVetLevel * 8}% atk &amp; speed
            </span>
          </div>
        )}
        {tile.defVetLevel > 0 && (
          <div className="tile-options__row">
            <span className="tile-options__label">Defence vets</span>
            <span className="tile-options__value">
              Lv {tile.defVetLevel} · +{tile.defVetLevel * 12}% def
            </span>
          </div>
        )}
        {isBusy && (
          <div className="tile-options__row">
            <span className="tile-options__label">Status</span>
            <span className="tile-options__value tile-options__value--busy">
              {tile.fortLevel > 0 && tile.busyUntil !== null && tile.busyUntil > state.now
                ? `Building fort lv ${tile.fortLevel}…`
                : "In action"}
            </span>
          </div>
        )}
      </div>

      {isOwned && (
        <div className="tile-options__actions">
          <button
            className="tile-options__action"
            disabled={!canFortify}
            onClick={() => { onFortify(tileId); onClose(); }}
            title={tile.fortLevel >= FORT.MAX_LEVEL ? "Max level" : `${FORT.GOLD_COST_PER_LEVEL} gold`}
          >
            {tile.fortLevel >= FORT.MAX_LEVEL
              ? `Fort max (${FORT.MAX_LEVEL})`
              : `Fort lv ${tile.fortLevel + 1} — ${FORT.GOLD_COST_PER_LEVEL}g`}
          </button>
          <button
            className="tile-options__action"
            disabled={!canArmour}
            onClick={() => { onArmour(tileId); onClose(); }}
            title={tile.armoured ? "Already armoured" : `${ARMOUR.GOLD_COST} gold`}
          >
            {tile.armoured ? "Armoured" : `Armour ${ARMOUR.GOLD_COST}g`}
          </button>
        </div>
      )}
    </div>
  );
}
