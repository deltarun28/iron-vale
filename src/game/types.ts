/**
 * types.ts — Shared type definitions for the entire game.
 *
 * All game data flows as plain TypeScript interfaces — no classes, no hidden
 * state. TileDefinition holds static map data; TileState holds live game data.
 * GameState is the single source of truth updated immutably on every tick.
 */

// A "union type" can only ever be one of the listed string values.
// TypeScript will catch any typo at compile time — "Player1" or "p1" would be an error.
export type PlayerId = "player1" | "player2" | "player3" | "player4";

// OwnerId extends PlayerId by adding a third option.
// The | symbol means "or", so this is: any player, or neutral.
export type OwnerId = PlayerId | "neutral";

// Teams group players for win conditions, friendly fire, and sea-lane cost.
// In FFA modes each player gets their own team. In team modes (e.g. 2v2)
// multiple players share a team id.
export type TeamId = "team1" | "team2" | "team3" | "team4";

export type TerrainType = "plains" | "forest" | "mountain";

export type Difficulty = "easy" | "normal" | "hard";

/** Named map identifier — what the player picks on the start screen. */
export type MapId = "river_crown" | "borderlands";

/** Which map art is used for the match. All three share the same Iron Vale hex layout. */
export type MapTheme = "default" | "winter" | "autumn";

/** The player-count and team arrangement for a match. */
export type PlayerMode = "1v1" | "1v1v1" | "1v1v1v1" | "2v2";

/**
 * GamePhase is mode-agnostic: a match is either still playing or has ended.
 * The actual winner is stored in GameState.winningTeam so the same two-state
 * enum works for any number of teams.
 */
export type GamePhase = "preview" | "playing" | "ended";

/** The four movement/combat categories. Determines timing and resolution logic. */
export type ActionType =
  | "land_reinforce"
  | "land_attack"
  | "sea_move"
  | "sea_attack";

/** The AI's current strategic posture. Influences target selection and troop sizing. */
export type AIStance = "defensive" | "balanced" | "aggressive";

/** Veteran experience level (attack or defence). 0 = none, 3 = max. */
export type VetLevel = 0 | 1 | 2 | 3;

/** Fortification level. 0 = none, 5 = max. */
export type FortLevel = 0 | 1 | 2 | 3 | 4 | 5;

// An "interface" describes the shape of an object - every field listed here
// must be present (unless marked optional with ?).
export interface AxialCoord {
  q: number; // column in the hex grid
  r: number; // row in the hex grid
}

// TileDefinition holds the fixed, map-level data for a hex.
// It describes what the tile IS and never changes during a game.
export interface TileDefinition {
  id: string;
  name: string;
  terrain: TerrainType;
  startingOwner: OwnerId;
  startingTroops: number;
  isCapital: boolean;
  isTown: boolean;
  coastal: boolean;
  hasBridge?: boolean; // The ? makes this field optional - it may be absent
  adjacent: string[];  // IDs of tiles reachable by land movement
  coord: AxialCoord;
}

// TileState holds the live, changing data for a hex during a game.
// Splitting it from TileDefinition lets us update state without touching map data.
export interface TileState {
  id: string;
  owner: OwnerId;
  troops: number;

  // null means "not busy". A number is the game timestamp when the busy state ends.
  // Neutral territories ignore this for production purposes.
  busyUntil: number | null;

  // Prevents launching another sea action too soon after the last one.
  embarkCooldownUntil: number | null;

  // Gold generation pauses briefly after a town or capital changes hands.
  goldFrozenUntil: number | null;

  // Fortification level. Each level adds +6% defence and slows attacks.
  // Level drops by 2 when captured (minimum 0). Building costs 5g and takes 4s per level.
  fortLevel: FortLevel;
  armoured: boolean;  // equipped garrison: +25% combat power for attack and defence

  // Veteran levels earned through combat experience.
  // Attack vets are earned by winning attacks; defence vets by surviving defence.
  // Levels travel with troops when the garrison moves.
  attackVetLevel: VetLevel;
  defVetLevel: VetLevel;
}

/**
 * A sea lane connects two coastal tiles and allows sea movement and sea attacks
 * between them. `distance` is an abstract weight used in travel-time formulas —
 * larger values mean longer crossings. Bidirectional lanes only need one entry
 * in the data; `findSeaLaneBetween` checks both directions.
 */
export interface SeaLane {
  id: string;
  from: string;
  to: string;
  /** Abstract travel weight — higher means longer crossing time and higher sea cost. */
  distance: number;
  bidirectional: boolean;
}

export interface PlayerState {
  id: PlayerId;
  teamId: TeamId;
  gold: number;
  goldCap: number;
  capitalsHeld: number;

  // When a player loses a capital while over the new gold cap, half the
  // excess is held here. The player can reclaim it by retaking the capital
  // within the reclaim window.
  escrowGold: number;
  escrowCapitalId: string | null;
  escrowExpiresAt: number | null;

  // Cumulative stats tracked throughout the match for the end-game screen.
  // Current-state snapshots are useless for the loser (always 0 at game end),
  // so we record totals and peaks as the game progresses.
  /** Most tiles ever held simultaneously — updated every tick. */
  peakTilesHeld: number;
  /** Troops added by production across all owned tiles over the entire match. */
  totalTroopsProduced: number;
  /** Gold added by production from all capitals and towns over the entire match. */
  totalGoldEarned: number;
  /** Tiles lost to any opponent (or neutral invasion) this match. */
  tilesLost: number;
  /** Capitals lost this match — fuels the comeback achievement. */
  capitalsLost: number;
  /** True once this player has successfully reclaimed escrowed gold. */
  escrowReclaimed: boolean;
}

/**
 * A combat that resolved recently. Kept in GameState for a few seconds so the
 * renderer can draw clash effects and casualty numbers; pruned by updateGame.
 */
export interface CombatEvent {
  /** Game time the combat resolved. Events are append-only, so consumers can
   * track the last-processed time instead of needing ids. */
  time: number;
  targetTileId: string;
  attackerOwner: OwnerId;
  defenderOwner: OwnerId;
  attackerWon: boolean;
  attackerLosses: number;
  defenderLosses: number;
}

/** One point on the match timeline: tile counts per player, sampled every ~5s. */
export interface TimelineSample {
  t: number;
  tiles: Partial<Record<PlayerId, number>>;
}

// ActiveAction represents a troop movement or attack that is in progress.
// Actions resolve after a calculated delay - nothing happens instantly.
export interface ActiveAction {
  id: string;
  type: ActionType;
  owner: PlayerId;

  sourceTileId: string;
  targetTileId: string;

  troopsSent: number;

  startedAt: number;  // game time when the action began (seconds)
  resolvesAt: number; // game time when the action resolves (seconds)

  isSeaAction: boolean;
  targetBusyLocked: boolean;

  // Captured at dispatch time so the garrison's experience travels with the troops.
  attackerArmoured: boolean;
  attackerAttackVetLevel: VetLevel;
  attackerDefVetLevel: VetLevel;
  defenderFortLevel: FortLevel; // captured at dispatch so timing uses it

  // For chained reinforcements: tile IDs still to visit after the current targetTileId.
  // When a leg resolves and this is non-empty, troops continue to the next tile
  // rather than depositing at the current target.
  remainingPath?: string[];

  // Fraction of each intermediate tile's total troops to forward on the next leg.
  // Set on chained moves so each hop re-applies the same send fraction to the
  // new tile total rather than forwarding a fixed troop count.
  sendFraction?: number;
}

// GameState is the single source of truth for the entire game.
// Rather than mutating this object, every update produces a fresh copy.
// This makes bugs easier to trace and state changes easy to reason about.
export interface GameState {
  phase: GamePhase;

  // The team that has won the match. Set when phase transitions to "ended".
  // Stays null while phase === "playing".
  winningTeam: TeamId | null;

  // The mode this match was created in. Stored so save/load and the UI can
  // recover team layout without recomputing it.
  playerMode: PlayerMode;

  // Which map was used to create this match.
  mapId: MapId;

  // Which seasonal art theme the match was created with. Stored in state so
  // save/load restores the same art instead of reverting to the default.
  mapTheme: MapTheme;

  // Tile IDs promoted to capitals at match creation (starting tiles are towns
  // on the map and get promoted per player). Persisted so save/load can
  // re-apply the promotions after regenerating tileDefinitions from source.
  capitalTileIds: string[];

  // Elapsed game time in seconds, incremented each tick by deltaSeconds.
  now: number;

  tiles: Record<string, TileState>;                // live data, keyed by tile id
  tileDefinitions: Record<string, TileDefinition>; // static map data, keyed by tile id
  seaLanes: SeaLane[];

  // Partial because not every mode populates all four player slots. Code
  // that reads from this Record should null-check or iterate explicitly via
  // getActivePlayers() in state.ts.
  players: Partial<Record<PlayerId, PlayerState>>;

  activeActions: ActiveAction[];

  // Recently-resolved combats for renderer effects. Pruned after a few seconds.
  combatEvents: CombatEvent[];

  // Tile counts per player sampled every ~5s, drawn as the end-screen match
  // timeline. Append-only; the array is replaced (never mutated) on append so
  // clones can share it safely.
  timeline: TimelineSample[];

  ai: AIState;

  // Game time of the last neutral-aggression check (runs every 3s on Normal/Hard).
  lastNeutralAggressionAt: number;

  // Game time of the last neutral-fortification check (runs every 5s, all difficulties).
  lastNeutralFortifyAt: number;
}

/** Per-AI-player strategic state. Each AI keeps its own stance so one
 * player's stance change never bleeds into another's in 3–4 player modes. */
export interface AIPlayerState {
  stance: AIStance;
  stanceChangedAt: number;
}

export interface AIState {
  difficulty: Difficulty;
  // The think timer is shared: all AI players act in one pass when it elapses
  // (see updateAI), so a single timer keeps them fairly scheduled.
  lastThinkAt: number;
  nextThinkAt: number;
  byPlayer: Partial<Record<PlayerId, AIPlayerState>>;
}

// CombatInput and CombatResult keep the combat function pure and testable.
// The caller provides randomValue so tests can pass a fixed value and get
// deterministic results without touching Math.random.
export interface CombatInput {
  attackerTroops: number;
  defenderTroops: number;
  defenderTerrain: TerrainType;
  defenderIsCapital: boolean;
  isSeaAttack: boolean;
  randomValue: number;
  attackerArmoured: boolean;
  attackerAttackVetLevel: VetLevel;
  defenderArmoured: boolean;
  defenderFortLevel: FortLevel;
  defenderDefVetLevel: VetLevel;
}

/** The outcome of a resolveCombat call. Exposed fields are used by the renderer and tests. */
export interface CombatResult {
  attackerWon: boolean;
  attackerSurvivors: number;
  defenderSurvivors: number;
  /** Attacker's power after all bonuses and the random factor are applied. */
  adjustedAttackerPower: number;
  /** Defender's power after all bonuses (terrain, fort, vet, etc.) are applied. */
  defenderPower: number;
  /** The random multiplier that was applied to the attacker this combat. */
  randomFactor: number;
}

/**
 * Returned by validateLandAction / validateSeaAction so callers can inspect
 * the reason without try/catch. `reason` is only present when `valid` is false.
 */
export interface MoveValidationResult {
  valid: boolean;
  reason?: string;
}

/** Breakdown of a sea movement's gold cost, used in the HUD drag preview. */
export interface SeaCostResult {
  /** Final gold deducted from the player. */
  cost: number;
  effectiveWeight: number;
  /** Pre-discount cost before the town/capital reduction is applied. */
  baseCost: number;
  /** True when the source is a town or capital and the half-price rule applied. */
  discounted: boolean;
  /** True when both ends are friendly towns/capitals and the move is free. */
  freeTownToTown: boolean;
}
