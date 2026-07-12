/**
 * state.ts — GameState construction, cloning, team helpers, and win-condition check.
 *
 * The central rule: game state is never mutated in place. Every update function
 * calls cloneGameState, mutates the clone, and returns it. This makes bugs
 * easier to trace and lets React's shallow-equality checks trigger re-renders
 * reliably.
 *
 * MODE_PLAYER_TEAMS defines the full team layout for every PlayerMode. Changing
 * one row here is enough to retune a mode — no other module reads team layout
 * from elsewhere.
 */

import {
  CAPITAL_RECLAIM_WINDOW_SECONDS,
  GOLD_CAP,
  STARTING_GOLD,
  STARTING_POSITIONS,
} from "./constants";
import { getMapConfig, type StartingTileSpec } from "./maps";
import type {
  AIState,
  Difficulty,
  GameState,
  MapId,
  MapTheme,
  OwnerId,
  PlayerId,
  PlayerMode,
  PlayerState,
  TeamId,
  TileState,
} from "./types";

// Maps each PlayerMode to the players it spawns and which team each is on.
// In FFA modes every player gets their own team; in 2v2 we alternate team
// assignments so the human (player1) and one AI partner share team1 while
// the other two AIs share team2. Changing a row here is enough to retune a
// mode — no other module reads team layout from elsewhere.
export const MODE_PLAYER_TEAMS: Record<
  PlayerMode,
  Partial<Record<PlayerId, TeamId>>
> = {
  "1v1": { player1: "team1", player2: "team2" },
  "1v1v1": { player1: "team1", player2: "team2", player3: "team3" },
  "1v1v1v1": {
    player1: "team1",
    player2: "team2",
    player3: "team3",
    player4: "team4",
  },
  "2v2": {
    player1: "team1",
    player2: "team2",
    player3: "team1",
    player4: "team2",
  },
};

const ALL_PLAYER_IDS: readonly PlayerId[] = [
  "player1",
  "player2",
  "player3",
  "player4",
] as const;

// Exported so other modules can use it without each defining their own copy.
// Type predicate narrows OwnerId → PlayerId after a true return.
export function isPlayer(owner: OwnerId): owner is PlayerId {
  return (
    owner === "player1" ||
    owner === "player2" ||
    owner === "player3" ||
    owner === "player4"
  );
}

// Returns the player ids that have a PlayerState in this match. Use this
// instead of iterating `ALL_PLAYER_IDS` directly — modes with fewer players
// leave the unused slots undefined.
export function getActivePlayerIds(state: GameState): PlayerId[] {
  const out: PlayerId[] = [];
  for (const id of ALL_PLAYER_IDS) {
    if (state.players[id]) out.push(id);
  }
  return out;
}

/** Returns the team a player belongs to, or null if the player is not active in this match. */
export function getTeamId(state: GameState, playerId: PlayerId): TeamId | null {
  return state.players[playerId]?.teamId ?? null;
}

// All active players whose team differs from `playerId`'s team. Empty for
// degenerate inputs (e.g. an unknown player id or a player on no team).
export function getOpponents(state: GameState, playerId: PlayerId): PlayerId[] {
  const ownTeam = getTeamId(state, playerId);
  if (ownTeam === null) return [];
  return getActivePlayerIds(state).filter(
    (id) => id !== playerId && state.players[id]?.teamId !== ownTeam
  );
}

// All active players who share `playerId`'s team, excluding `playerId` itself.
export function getTeammates(state: GameState, playerId: PlayerId): PlayerId[] {
  const ownTeam = getTeamId(state, playerId);
  if (ownTeam === null) return [];
  return getActivePlayerIds(state).filter(
    (id) => id !== playerId && state.players[id]?.teamId === ownTeam
  );
}

// True when the two owners are both real players AND on the same team.
// Neutral never matches.
export function areAllies(
  state: GameState,
  ownerA: OwnerId,
  ownerB: OwnerId
): boolean {
  if (!isPlayer(ownerA) || !isPlayer(ownerB)) return false;
  if (ownerA === ownerB) return true;
  const a = getTeamId(state, ownerA);
  const b = getTeamId(state, ownerB);
  return a !== null && a === b;
}

/**
 * A player's gold cap starts at GOLD_CAP.BASE and increases by GOLD_CAP.PER_CAPITAL
 * for each capital they hold. Losing a capital reduces the cap immediately.
 */
export function calculateGoldCap(capitalsHeld: number): number {
  return GOLD_CAP.BASE + GOLD_CAP.PER_CAPITAL * capitalsHeld;
}

/** Counts how many capital tiles a given player currently owns. */
export function countCapitalsHeld(
  playerId: PlayerId,
  tiles: Record<string, TileState>,
  tileDefinitions: GameState["tileDefinitions"]
): number {
  return Object.values(tileDefinitions).filter((definition) => {
    const tile = tiles[definition.id];
    return definition.isCapital && tile?.owner === playerId;
  }).length;
}

/**
 * Builds the starting PlayerState for one player slot.
 * Starting gold and cap are derived from the starting capital count (always 1).
 */
export function createInitialPlayerState(
  playerId: PlayerId,
  teamId: TeamId,
  capitalsHeld: number
): PlayerState {
  return {
    id: playerId,
    teamId,
    gold: STARTING_GOLD,
    goldCap: calculateGoldCap(capitalsHeld),
    capitalsHeld,
    escrowGold: 0,
    escrowCapitalId: null,
    escrowExpiresAt: null,
    peakTilesHeld: capitalsHeld, // starts with one capital tile
    totalTroopsProduced: 0,
    totalGoldEarned: 0,
    tilesLost: 0,
    capitalsLost: 0,
    escrowReclaimed: false,
  };
}

// Weighted random pick without replacement. Returns a Map of playerId →
// tileId. Generalises across modes — passing more player ids just consumes
// more candidates from the spawn pool.
function assignStartingTiles(
  candidates: readonly StartingTileSpec[],
  playerIds: readonly PlayerId[]
): Map<PlayerId, string> {
  const remaining: { id: string; weight: number }[] = candidates.map(
    (entry) => ({ id: entry.id, weight: entry.pickWeight })
  );

  const assignments = new Map<PlayerId, string>();
  for (const playerId of playerIds) {
    if (remaining.length === 0) break;

    const totalWeight = remaining.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = Math.random() * totalWeight;
    let chosenIndex = remaining.length - 1; // safe fallback for FP rounding
    for (let i = 0; i < remaining.length; i += 1) {
      roll -= remaining[i]!.weight;
      if (roll <= 0) {
        chosenIndex = i;
        break;
      }
    }

    assignments.set(playerId, remaining[chosenIndex]!.id);
    remaining.splice(chosenIndex, 1);
  }

  return assignments;
}

// Builds the starting GameState for a given mode. Each active player draws a
// starting tile from the map's starting tile pool (weighted random without
// replacement); that tile is promoted to a capital for the match so every
// player begins with one capital regardless of which town they drew.
export function createInitialGameState(
  difficulty: Difficulty = "normal",
  playerMode: PlayerMode = "1v1",
  mapId: MapId = "river_crown",
  mapTheme: MapTheme = "default"
): GameState {
  const mapConfig = getMapConfig(mapId);
  const tileDefinitions = mapConfig.getTileDefinitions();
  const seaLanes = mapConfig.seaLanes;
  const startingTilePool: readonly StartingTileSpec[] = mapConfig.startingTiles;

  const tiles: Record<string, TileState> = Object.fromEntries(
    Object.values(tileDefinitions).map((definition) => [
      definition.id,
      {
        id: definition.id,
        owner: definition.startingOwner,
        troops: definition.startingTroops,
        busyUntil: null,
        embarkCooldownUntil: null,
        goldFrozenUntil: null,
        fortLevel: 0,
        armoured: false,
        attackVetLevel: 0,
        defVetLevel: 0,
      },
    ])
  );

  const teamLayout = MODE_PLAYER_TEAMS[playerMode];
  const activePlayerIds = ALL_PLAYER_IDS.filter((id) => teamLayout[id]);

  // Shuffle draw order so no player consistently gets first/last pick from
  // the weighted pool (sequential WRS without replacement is not order-neutral).
  const drawOrder = [...activePlayerIds];
  for (let i = drawOrder.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [drawOrder[i], drawOrder[j]] = [drawOrder[j]!, drawOrder[i]!];
  }

  const startingTiles = assignStartingTiles(startingTilePool, drawOrder);
  const capitalTileIds: string[] = [];
  for (const [playerId, tileId] of startingTiles) {
    const baseDef = tileDefinitions[tileId];
    const baseTile = tiles[tileId];
    if (!baseDef || !baseTile) continue;
    capitalTileIds.push(tileId);
    tileDefinitions[tileId] = {
      ...baseDef,
      isCapital: true,
      isTown: false,
    };
    tiles[tileId] = {
      ...baseTile,
      owner: playerId,
      troops: STARTING_POSITIONS.PLAYER_STARTING_TROOPS,
    };
  }

  // Easy mode: neutral tiles start with 1 fewer troop (minimum 1).
  // Makes early expansion less costly and gives new players more breathing room.
  if (difficulty === "easy") {
    for (const tile of Object.values(tiles)) {
      if (tile.owner === "neutral") {
        tile.troops = Math.max(1, tile.troops - 1);
      }
    }
  }

  // Hard mode (Borderlands): neutral tiles start with 1 extra troop.
  // Mountains: 3, towns: 6, plains/forests: 4.
  if (difficulty === "hard" && mapId === "borderlands") {
    for (const tile of Object.values(tiles)) {
      if (tile.owner === "neutral") {
        tile.troops += 1;
      }
    }
  }

  const players: Partial<Record<PlayerId, PlayerState>> = {};
  for (const playerId of activePlayerIds) {
    const teamId = teamLayout[playerId];
    if (!teamId) continue;
    const capitals = countCapitalsHeld(playerId, tiles, tileDefinitions);
    players[playerId] = createInitialPlayerState(playerId, teamId, capitals);
  }

  // Every AI slot (all non-human players) gets its own stance state.
  const aiByPlayer: AIState["byPlayer"] = {};
  for (const playerId of activePlayerIds) {
    if (playerId === "player1") continue;
    aiByPlayer[playerId] = { stance: "balanced", stanceChangedAt: 0 };
  }

  return {
    phase: "preview",
    winningTeam: null,
    playerMode,
    mapId,
    mapTheme,
    capitalTileIds,
    now: 0,
    tiles,
    tileDefinitions,
    seaLanes,
    players,
    activeActions: [],
    combatEvents: [],
    timeline: [],
    ai: {
      difficulty,
      lastThinkAt: 0,
      nextThinkAt: 1, // give the AI a one-second head start before its first think
      byPlayer: aiByPlayer,
    },
    lastNeutralAggressionAt: 0,
    lastNeutralFortifyAt: 0,
  };
}

// Called when a player loses a capital while they have more gold than their new cap.
// Half the excess is lost immediately. The other half goes into escrow.
// If the player retakes the capital in time, the escrowed gold comes back.
export function handleCapitalLossEscrow(
  state: GameState,
  previousOwner: PlayerId,
  capitalTileId: string
): GameState {
  const nextState = cloneGameState(state);
  const player = nextState.players[previousOwner];
  if (!player) return nextState;

  const newCapitalsHeld = countCapitalsHeld(
    previousOwner,
    nextState.tiles,
    nextState.tileDefinitions
  );

  const newGoldCap = calculateGoldCap(newCapitalsHeld);
  const overCapGold = Math.max(0, player.gold - newGoldCap);

  if (overCapGold <= 0) {
    player.capitalsHeld = newCapitalsHeld;
    player.goldCap = newGoldCap;
    return nextState;
  }

  // Half is lost immediately; half is held in escrow for a possible reclaim.
  const escrowGold = overCapGold / 2;

  player.gold = Math.min(player.gold - overCapGold, newGoldCap);
  player.goldCap = newGoldCap;
  player.capitalsHeld = newCapitalsHeld;
  player.escrowGold = escrowGold;
  player.escrowCapitalId = capitalTileId;
  player.escrowExpiresAt = nextState.now + CAPITAL_RECLAIM_WINDOW_SECONDS;

  return nextState;
}

// Called when a player captures a capital. If they have escrow waiting for
// exactly that capital and the timer hasn't expired, the gold is returned.
export function handleCapitalReclaimEscrow(
  state: GameState,
  playerId: PlayerId,
  capitalTileId: string
): GameState {
  const nextState = cloneGameState(state);
  const player = nextState.players[playerId];
  if (!player) return nextState;

  const escrowIsActive =
    player.escrowGold > 0 &&
    player.escrowCapitalId === capitalTileId &&
    player.escrowExpiresAt !== null &&
    nextState.now <= player.escrowExpiresAt;

  if (!escrowIsActive) {
    return nextState;
  }

  player.gold = Math.min(player.gold + player.escrowGold, player.goldCap);
  player.escrowGold = 0;
  player.escrowCapitalId = null;
  player.escrowExpiresAt = null;
  player.escrowReclaimed = true; // fuels the Treasurer achievement

  return nextState;
}

// Clears any escrow that the player failed to reclaim in time. Mutates the
// draft in place — callers must own the state (see updateGame's single-clone
// tick). Use expireEscrowTimers for an immutable version.
export function applyEscrowExpiry(draft: GameState): void {
  for (const playerId of getActivePlayerIds(draft)) {
    const player = draft.players[playerId];
    if (!player) continue;

    if (
      player.escrowExpiresAt !== null &&
      player.escrowExpiresAt <= draft.now
    ) {
      player.escrowGold = 0;
      player.escrowCapitalId = null;
      player.escrowExpiresAt = null;
    }
  }
}

/** Immutable wrapper around applyEscrowExpiry. */
export function expireEscrowTimers(state: GameState): GameState {
  const nextState = cloneGameState(state);
  applyEscrowExpiry(nextState);
  return nextState;
}

// A team is "alive" if any of its players still owns at least one tile. The
// match ends as soon as only one team is alive. Works the same way for 1v1
// (where each team has one player) and 2v2 (two players per team).
// Returns the input state unchanged while the game continues — the check runs
// every tick, so the common path must not allocate a clone.
export function checkWinCondition(state: GameState): GameState {
  if (state.phase === "ended") return state;

  const teamsAlive = new Set<TeamId>();

  for (const playerId of getActivePlayerIds(state)) {
    const player = state.players[playerId];
    if (!player) continue;
    const ownsAnyTile = Object.values(state.tiles).some(
      (tile) => tile.owner === playerId
    );
    const hasTroopsInFlight = state.activeActions.some(
      (action) => action.owner === playerId
    );
    if (ownsAnyTile || hasTroopsInFlight) teamsAlive.add(player.teamId);
  }

  if (teamsAlive.size > 1) return state;

  const nextState = cloneGameState(state);
  nextState.phase = "ended";
  nextState.winningTeam = teamsAlive.size === 1
    ? Array.from(teamsAlive)[0]!
    : null;

  return nextState;
}

// We never mutate game state in place. Instead, every update function receives
// the current state and returns a new copy. cloneGameState does a shallow copy
// of the top-level object and a fresh copy of every nested collection so that
// changes to the new state cannot accidentally affect the old one.
export function cloneGameState(state: GameState): GameState {
  const players: Partial<Record<PlayerId, PlayerState>> = {};
  for (const id of ALL_PLAYER_IDS) {
    const player = state.players[id];
    if (player) players[id] = { ...player };
  }

  const aiByPlayer: AIState["byPlayer"] = {};
  for (const id of ALL_PLAYER_IDS) {
    const aiPlayer = state.ai.byPlayer[id];
    if (aiPlayer) aiByPlayer[id] = { ...aiPlayer };
  }

  return {
    ...state,
    tiles: Object.fromEntries(
      Object.entries(state.tiles).map(([id, tile]) => [id, { ...tile }])
    ),
    players,
    activeActions: state.activeActions.map((action) => ({ ...action })),
    // Events are immutable once created; copy the array so the draft can push.
    // timeline is NOT copied: it is replaced (never mutated) on append.
    combatEvents: state.combatEvents.slice(),
    ai: { ...state.ai, byPlayer: aiByPlayer },
  };
}
