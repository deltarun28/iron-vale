/**
 * combat.ts — Pure combat resolution logic.
 *
 * All functions here are stateless: they take numbers in and return numbers
 * out. Nothing reads from or writes to GameState so the formulas are easy to
 * unit-test by passing fixed inputs.
 *
 * The key design choices:
 *  - Defenders get a structural advantage that shrinks as fight size grows,
 *    so small skirmishes are defender-favoured but large engagements are fair.
 *  - Randomness is applied only to the attacker and scales with 1/√(product),
 *    so big battles are nearly deterministic while small fights are noisy.
 *  - The caller provides `randomValue` (from Math.random()) so tests can pass
 *    a fixed value and get deterministic results.
 */

import { ARMOUR, COMBAT, FORT, VETERAN, getTerrainDefenceMultiplier } from "./constants";
import type { CombatInput, CombatResult } from "./types";

/** Multiplier applied to an attacker's power for each attack veteran level. */
export function calculateVeteranAttackMultiplier(level: number): number {
  return 1 + VETERAN.ATTACK_BONUS_PER_LEVEL * level;
}

/** Multiplier applied to a defender's power for each defence veteran level. */
export function calculateVeteranDefenceMultiplier(level: number): number {
  return 1 + VETERAN.DEFENCE_BONUS_PER_LEVEL * level;
}

/** Clamps a number so it never goes below `min` or above `max`. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * How long a combat takes is based on the SMALLER of the two forces.
 * A 100v5 resolves as fast as a 5v100 — large armies finish small fights
 * quickly, but evenly-matched battles take longer.
 */
export function calculateCombatResolutionTime(
  attackerTroops: number,
  defenderTroops: number
): number {
  const engagedForce = Math.max(1, Math.min(attackerTroops, defenderTroops));

  return (
    COMBAT.RESOLUTION_BASE_SECONDS +
    COMBAT.RESOLUTION_PER_SQRT_MIN_FORCE * Math.sqrt(engagedForce)
  );
}

/**
 * Defenders have a structural advantage that is especially large in small
 * fights and fades as the engaged force grows. Using 1/√(engaged) gives a
 * steep advantage at 2v2 that flattens out past ~20 troops.
 */
export function calculateDefenderBias(
  attackerTroops: number,
  defenderTroops: number
): number {
  const engagedForce = Math.max(1, Math.min(attackerTroops, defenderTroops));

  return COMBAT.DEFENDER_BIAS_BASE / Math.sqrt(engagedForce);
}

/**
 * Randomness shrinks as the fight gets bigger. A 2v2 is very unpredictable;
 * a 100v100 is nearly deterministic. Using the fourth root (√√product)
 * produces a gentle curve that keeps large battles meaningful.
 */
export function calculateRandomness(
  attackerTroops: number,
  defenderTroops: number
): number {
  const product = Math.max(1, attackerTroops * defenderTroops);

  return COMBAT.RANDOMNESS_BASE / Math.sqrt(Math.sqrt(product));
}

/** The deterministic inputs to a combat: both sides' power before the random factor. */
interface CombatPowers {
  /** Attacker power after armour and vet bonuses, before the random factor. */
  attackerPower: number;
  /** Defender power after every modifier including the small-fight bias. */
  defenderPower: number;
  /** Half-width of the uniform random band applied to the attacker. */
  randomness: number;
}

// The single source of the power formula — used by the real resolution below
// and by estimateCombatOutcome so AI planning can never drift from the rules.
function computeCombatPowers(
  input: Omit<CombatInput, "randomValue">,
  attackerTroops: number,
  defenderTroops: number
): CombatPowers {
  // Build attacker power: troops × infantry power, then upgrade bonuses.
  let attackerPower = attackerTroops * COMBAT.INFANTRY_POWER;
  if (input.attackerArmoured) attackerPower *= ARMOUR.ATTACK_MULTIPLIER;
  if (input.attackerAttackVetLevel > 0) {
    attackerPower *= calculateVeteranAttackMultiplier(input.attackerAttackVetLevel);
  }

  // Build defender power, layering multipliers in order.
  let defenderPower = defenderTroops * COMBAT.INFANTRY_POWER;
  defenderPower *= getTerrainDefenceMultiplier(input.defenderTerrain);
  if (input.defenderIsCapital) defenderPower *= COMBAT.CAPITAL_DEFENCE_MULTIPLIER;
  if (input.isSeaAttack)       defenderPower *= COMBAT.SEA_ATTACK_DEFENCE_MULTIPLIER;
  if (input.defenderFortLevel > 0) {
    defenderPower *= (1 + FORT.DEFENCE_BONUS_PER_LEVEL * input.defenderFortLevel);
  }
  if (input.defenderArmoured)       defenderPower *= ARMOUR.DEFENCE_MULTIPLIER;
  if (input.defenderDefVetLevel > 0) {
    defenderPower *= calculateVeteranDefenceMultiplier(input.defenderDefVetLevel);
  }

  // Apply the small-fight defender bias on top of all other modifiers.
  defenderPower *= 1 + calculateDefenderBias(attackerTroops, defenderTroops);

  return {
    attackerPower,
    defenderPower,
    randomness: calculateRandomness(attackerTroops, defenderTroops),
  };
}

/** A pre-battle estimate: the exact win probability over the random factor. */
export interface CombatEstimate {
  /** P(attacker wins), integrating over the uniform random factor. */
  winProbability: number;
  attackerPower: number;
  defenderPower: number;
}

/**
 * Estimates a combat without rolling it. The attacker wins when
 * attackerPower × f > defenderPower with f uniform in [1−r, 1+r], so the win
 * probability has a closed form. Uses only information visible to any player —
 * this is the "do the maths before attacking" a strong human does, not a cheat.
 */
export function estimateCombatOutcome(input: Omit<CombatInput, "randomValue">): CombatEstimate {
  const attackerTroops = Math.max(0, Math.floor(input.attackerTroops));
  const defenderTroops = Math.max(0, Math.floor(input.defenderTroops));

  if (attackerTroops <= 0) {
    return { winProbability: 0, attackerPower: 0, defenderPower: defenderTroops };
  }
  if (defenderTroops <= 0) {
    return { winProbability: 1, attackerPower: attackerTroops, defenderPower: 0 };
  }

  const powers = computeCombatPowers(input, attackerTroops, defenderTroops);
  const ratio = powers.defenderPower / Math.max(1e-9, powers.attackerPower);
  const winProbability = clamp(
    (1 + powers.randomness - ratio) / (2 * powers.randomness),
    0,
    1
  );

  return {
    winProbability,
    attackerPower: powers.attackerPower,
    defenderPower: powers.defenderPower,
  };
}

/**
 * Resolves a single combat between an attacker and defender.
 *
 * Calculation order:
 *  1. Build attacker power: troops × infantry power, then armour and vet bonuses.
 *  2. Build defender power: troops × terrain × capital × sea × fort × armour × vet.
 *  3. Apply the small-fight defender bias to defender power.
 *  4. Apply random factor (±randomness) to attacker power only.
 *  5. Attacker wins if adjustedAttackerPower > defenderPower.
 *  6. Compute survivor counts from the power ratio — a closer fight means more losses.
 *
 * The winner always retains at least 1 survivor so tiles are never left empty.
 */
export function resolveCombat(input: CombatInput): CombatResult {
  const attackerTroops = Math.max(0, Math.floor(input.attackerTroops));
  const defenderTroops = Math.max(0, Math.floor(input.defenderTroops));

  // Edge cases: one side is already eliminated before combat begins.
  if (attackerTroops <= 0) {
    return {
      attackerWon: false,
      attackerSurvivors: 0,
      defenderSurvivors: defenderTroops,
      adjustedAttackerPower: 0,
      defenderPower: defenderTroops,
      randomFactor: 1,
    };
  }

  if (defenderTroops <= 0) {
    return {
      attackerWon: true,
      attackerSurvivors: attackerTroops,
      defenderSurvivors: 0,
      adjustedAttackerPower: attackerTroops,
      defenderPower: 0,
      randomFactor: 1,
    };
  }

  // Randomness is applied only to the attacker so it can swing a fight
  // either way without additionally buffing the already-advantaged defender.
  const {
    attackerPower: baseAttackerPower,
    defenderPower,
    randomness,
  } = computeCombatPowers(input, attackerTroops, defenderTroops);

  // Map input.randomValue (0–1) to a factor between (1 - randomness) and (1 + randomness).
  const safeRandomValue = clamp(input.randomValue, 0, 1);
  const randomFactor = 1 - randomness + safeRandomValue * (2 * randomness);

  const adjustedAttackerPower = baseAttackerPower * randomFactor;
  const attackerWon = adjustedAttackerPower > defenderPower;

  if (attackerWon) {
    // The power ratio tells us how dominant the attacker was.
    // A close win means high losses; a lopsided win means low losses.
    const powerRatio = adjustedAttackerPower / Math.max(1, defenderPower);
    const attackerLossRate = clamp(1 / powerRatio, 0.2, 0.95);
    const attackerLosses = Math.round(attackerTroops * attackerLossRate);
    const attackerSurvivors = Math.max(1, attackerTroops - attackerLosses);

    return {
      attackerWon: true,
      attackerSurvivors,
      defenderSurvivors: 0,
      adjustedAttackerPower,
      defenderPower,
      randomFactor,
    };
  }

  // Defender wins — compute proportional defender losses from the power ratio.
  const powerRatio = adjustedAttackerPower / Math.max(1, defenderPower);
  const defenderLossRate = clamp(powerRatio, 0.05, 0.85);
  const defenderLosses = Math.round(defenderTroops * defenderLossRate);
  const defenderSurvivors = Math.max(1, defenderTroops - defenderLosses);

  return {
    attackerWon: false,
    attackerSurvivors: 0,
    defenderSurvivors,
    adjustedAttackerPower,
    defenderPower,
    randomFactor,
  };
}
