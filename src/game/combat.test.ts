import { describe, expect, it } from "vitest";
import {
  calculateCombatResolutionTime,
  calculateDefenderBias,
  calculateRandomness,
  calculateVeteranAttackMultiplier,
  calculateVeteranDefenceMultiplier,
  estimateCombatOutcome,
  resolveCombat,
} from "./combat";
import type { CombatInput } from "./types";

// Baseline input: plain-terrain fight with no upgrades and the neutral
// mid-point random value. Tests override just the fields they exercise.
function makeInput(over: Partial<CombatInput> = {}): CombatInput {
  return {
    attackerTroops: 10,
    defenderTroops: 10,
    defenderTerrain: "plains",
    defenderIsCapital: false,
    isSeaAttack: false,
    randomValue: 0.5,
    attackerArmoured: false,
    attackerAttackVetLevel: 0,
    defenderArmoured: false,
    defenderFortLevel: 0,
    defenderDefVetLevel: 0,
    ...over,
  };
}

describe("resolveCombat", () => {
  it("defender wins automatically when the attacker has no troops", () => {
    const result = resolveCombat(makeInput({ attackerTroops: 0, defenderTroops: 5 }));
    expect(result.attackerWon).toBe(false);
    expect(result.attackerSurvivors).toBe(0);
    expect(result.defenderSurvivors).toBe(5);
  });

  it("attacker wins automatically when the defender has no troops", () => {
    const result = resolveCombat(makeInput({ attackerTroops: 7, defenderTroops: 0 }));
    expect(result.attackerWon).toBe(true);
    expect(result.attackerSurvivors).toBe(7);
    expect(result.defenderSurvivors).toBe(0);
  });

  it("equal forces favour the defender at the neutral random value", () => {
    // 10v10: defender bias (~+13%) tips the fight without any modifiers.
    const result = resolveCombat(makeInput());
    expect(result.attackerWon).toBe(false);
    expect(result.defenderSurvivors).toBeGreaterThanOrEqual(1);
  });

  it("randomness can swing a close fight either way", () => {
    // 12v10 sits inside the random band: max roll wins, min roll loses.
    const luckyWin = resolveCombat(makeInput({ attackerTroops: 12, randomValue: 1 }));
    const unluckyLoss = resolveCombat(makeInput({ attackerTroops: 12, randomValue: 0 }));
    expect(luckyWin.attackerWon).toBe(true);
    expect(unluckyLoss.attackerWon).toBe(false);
  });

  it("an overwhelming attacker wins and keeps at least one survivor", () => {
    const result = resolveCombat(makeInput({ attackerTroops: 100, defenderTroops: 3 }));
    expect(result.attackerWon).toBe(true);
    expect(result.attackerSurvivors).toBeGreaterThanOrEqual(1);
    expect(result.defenderSurvivors).toBe(0);
  });

  it("the winner always retains at least one survivor in close fights", () => {
    for (const randomValue of [0, 0.25, 0.5, 0.75, 1]) {
      const result = resolveCombat(
        makeInput({ attackerTroops: 10, defenderTroops: 9, randomValue })
      );
      const winnerSurvivors = result.attackerWon
        ? result.attackerSurvivors
        : result.defenderSurvivors;
      expect(winnerSurvivors).toBeGreaterThanOrEqual(1);
    }
  });

  it("terrain, capital, sea, fort, armour, and vet all raise defender power", () => {
    const base = resolveCombat(makeInput()).defenderPower;
    const cases: Partial<CombatInput>[] = [
      { defenderTerrain: "forest" },
      { defenderTerrain: "mountain" },
      { defenderIsCapital: true },
      { isSeaAttack: true },
      { defenderFortLevel: 3 },
      { defenderArmoured: true },
      { defenderDefVetLevel: 2 },
    ];
    for (const over of cases) {
      expect(resolveCombat(makeInput(over)).defenderPower).toBeGreaterThan(base);
    }
  });

  it("armour and attack vets raise attacker power", () => {
    const base = resolveCombat(makeInput({ randomValue: 0.5 })).adjustedAttackerPower;
    const armoured = resolveCombat(
      makeInput({ attackerArmoured: true, randomValue: 0.5 })
    ).adjustedAttackerPower;
    const vet = resolveCombat(
      makeInput({ attackerAttackVetLevel: 3, randomValue: 0.5 })
    ).adjustedAttackerPower;
    expect(armoured).toBeGreaterThan(base);
    expect(vet).toBeGreaterThan(base);
  });

  it("clamps out-of-range random values instead of exploding", () => {
    const result = resolveCombat(makeInput({ randomValue: 42 }));
    expect(result.randomFactor).toBeLessThanOrEqual(2);
    expect(result.randomFactor).toBeGreaterThan(0);
  });
});

describe("estimateCombatOutcome", () => {
  function estimate(over: Partial<CombatInput> = {}): number {
    // estimateCombatOutcome takes CombatInput minus randomValue; the extra
    // key is simply ignored, so reuse the same fixture builder.
    return estimateCombatOutcome(makeInput(over)).winProbability;
  }

  it("returns certainties for empty sides", () => {
    expect(estimate({ attackerTroops: 0, defenderTroops: 5 })).toBe(0);
    expect(estimate({ attackerTroops: 5, defenderTroops: 0 })).toBe(1);
  });

  it("is monotonic in attacker force size", () => {
    let previous = 0;
    for (const attackerTroops of [5, 10, 15, 20, 30]) {
      const p = estimate({ attackerTroops, defenderTroops: 10 });
      expect(p).toBeGreaterThanOrEqual(previous);
      previous = p;
    }
  });

  it("overwhelming attacks are certain, hopeless ones impossible", () => {
    expect(estimate({ attackerTroops: 100, defenderTroops: 2 })).toBe(1);
    expect(estimate({ attackerTroops: 2, defenderTroops: 100 })).toBe(0);
  });

  it("defensive modifiers reduce the win probability", () => {
    const base = estimate({ attackerTroops: 14, defenderTroops: 10 });
    const cases: Partial<CombatInput>[] = [
      { defenderTerrain: "mountain" },
      { defenderFortLevel: 4 },
      { defenderArmoured: true },
      { defenderDefVetLevel: 3 },
      { isSeaAttack: true },
    ];
    for (const over of cases) {
      const p = estimate({ attackerTroops: 14, defenderTroops: 10, ...over });
      expect(p).toBeLessThan(base);
    }
  });

  it("matches resolveCombat's verdict at the random extremes", () => {
    // If the estimator says a win is certain, even the worst roll must win;
    // if it says impossible, even the best roll must lose.
    const certain = makeInput({ attackerTroops: 100, defenderTroops: 3 });
    expect(estimate(certain)).toBe(1);
    expect(resolveCombat({ ...certain, randomValue: 0 }).attackerWon).toBe(true);

    const hopeless = makeInput({ attackerTroops: 3, defenderTroops: 100 });
    expect(estimate(hopeless)).toBe(0);
    expect(resolveCombat({ ...hopeless, randomValue: 1 }).attackerWon).toBe(false);
  });
});

describe("combat formula helpers", () => {
  it("veteran multipliers grow linearly with level", () => {
    expect(calculateVeteranAttackMultiplier(0)).toBe(1);
    expect(calculateVeteranAttackMultiplier(3)).toBeCloseTo(1.24);
    expect(calculateVeteranDefenceMultiplier(0)).toBe(1);
    expect(calculateVeteranDefenceMultiplier(3)).toBeCloseTo(1.36);
  });

  it("resolution time scales with the smaller force", () => {
    const smallFight = calculateCombatResolutionTime(100, 4);
    const bigFight = calculateCombatResolutionTime(100, 100);
    expect(bigFight).toBeGreaterThan(smallFight);
    // Symmetric: 100v5 resolves as fast as 5v100.
    expect(calculateCombatResolutionTime(100, 5)).toBeCloseTo(
      calculateCombatResolutionTime(5, 100)
    );
  });

  it("defender bias is largest in small fights", () => {
    expect(calculateDefenderBias(2, 2)).toBeGreaterThan(calculateDefenderBias(50, 50));
  });

  it("randomness shrinks as fights grow", () => {
    expect(calculateRandomness(2, 2)).toBeGreaterThan(calculateRandomness(100, 100));
  });
});
