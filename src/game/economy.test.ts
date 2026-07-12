import { describe, expect, it } from "vitest";
import { spendGold, updateGoldProduction } from "./economy";
import {
  expireEscrowTimers,
  handleCapitalLossEscrow,
  handleCapitalReclaimEscrow,
} from "./state";
import { makeTestState } from "./testFixtures";

describe("updateGoldProduction", () => {
  it("capitals drip gold at the capital rate", () => {
    const state = makeTestState();
    state.players.player1!.gold = 0;
    // Capital rate is 0.25/s → 4 seconds yields exactly 1 gold.
    const next = updateGoldProduction(state, 4);
    expect(next.players.player1!.gold).toBeCloseTo(1);
    expect(next.players.player1!.totalGoldEarned).toBeCloseTo(1);
  });

  it("gold never exceeds the player's cap", () => {
    const state = makeTestState();
    state.players.player1!.gold = state.players.player1!.goldCap;
    const next = updateGoldProduction(state, 100);
    expect(next.players.player1!.gold).toBe(state.players.player1!.goldCap);
  });

  it("frozen tiles produce nothing", () => {
    const state = makeTestState();
    state.players.player1!.gold = 0;
    state.tiles["cap1"]!.goldFrozenUntil = 100;
    const next = updateGoldProduction(state, 10);
    expect(next.players.player1!.gold).toBe(0);
  });
});

describe("spendGold", () => {
  it("deducts the amount", () => {
    const state = makeTestState();
    state.players.player1!.gold = 5;
    const next = spendGold(state, "player1", 3);
    expect(next.players.player1!.gold).toBe(2);
    // Original state is untouched (immutable update).
    expect(state.players.player1!.gold).toBe(5);
  });

  it("throws on insufficient gold or negative amounts", () => {
    const state = makeTestState();
    state.players.player1!.gold = 2;
    expect(() => spendGold(state, "player1", 3)).toThrow();
    expect(() => spendGold(state, "player1", -1)).toThrow();
  });
});

describe("capital escrow", () => {
  // Simulates player1 losing cap1 while holding 30 gold: the new cap (no
  // capitals) is 10, so 20 gold is over-cap — 10 lost, 10 escrowed.
  function loseCapital() {
    const state = makeTestState();
    state.tiles["cap1"]!.owner = "player2";
    state.players.player1!.gold = 30;
    state.players.player1!.goldCap = 20;
    return handleCapitalLossEscrow(state, "player1", "cap1");
  }

  it("half the over-cap gold is lost, half held in escrow", () => {
    const next = loseCapital();
    const player = next.players.player1!;
    expect(player.goldCap).toBe(10);
    expect(player.gold).toBe(10);
    expect(player.escrowGold).toBe(10);
    expect(player.escrowCapitalId).toBe("cap1");
    expect(player.escrowExpiresAt).toBe(10); // now (0) + 10s window
  });

  it("retaking the capital inside the window returns the escrow", () => {
    let state = loseCapital();
    state.tiles["cap1"]!.owner = "player1";
    state.now = 5;
    // Restore the cap the recaptured capital grants so the refund fits.
    state.players.player1!.goldCap = 20;
    state = handleCapitalReclaimEscrow(state, "player1", "cap1");
    const player = state.players.player1!;
    expect(player.gold).toBe(20);
    expect(player.escrowGold).toBe(0);
    expect(player.escrowCapitalId).toBeNull();
  });

  it("reclaim after the window expires returns nothing", () => {
    let state = loseCapital();
    state.tiles["cap1"]!.owner = "player1";
    state.now = 11; // window was 10s
    state = handleCapitalReclaimEscrow(state, "player1", "cap1");
    expect(state.players.player1!.gold).toBe(10);
    expect(state.players.player1!.escrowGold).toBe(10); // untouched; expiry clears it
  });

  it("expireEscrowTimers clears an expired escrow", () => {
    let state = loseCapital();
    state.now = 11;
    state = expireEscrowTimers(state);
    const player = state.players.player1!;
    expect(player.escrowGold).toBe(0);
    expect(player.escrowCapitalId).toBeNull();
    expect(player.escrowExpiresAt).toBeNull();
  });
});
