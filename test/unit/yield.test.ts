import { type Address, type Hash, zeroAddress } from "viem";
import { describe, expect, it } from "vitest";

import {
  classifyTransfers,
  computeYield,
  movementKey,
  type ShareTransfer,
  type YieldEvents,
  type YieldResult,
} from "@/lib/yield";

const USER: Address = "0x1111111111111111111111111111111111111111";
const REDEEMER: Address = "0x2222222222222222222222222222222222222222";
const DEX: Address = "0x3333333333333333333333333333333333333333";
const OTHER: Address = "0x4444444444444444444444444444444444444444";

const tx = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as Hash;
const transfer = (n: number, from: Address, to: Address, shares: bigint): ShareTransfer => ({
  from,
  to,
  shares,
  blockNumber: BigInt(n),
  logIndex: 0,
  txHash: tx(n),
});
const mint = (n: number, shares: bigint) => transfer(n, zeroAddress, USER, shares);
const toRedeemer = (n: number, shares: bigint) => transfer(n, USER, REDEEMER, shares);

function run(args: {
  transfers: ShareTransfer[];
  events?: Partial<YieldEvents>;
  values?: [ShareTransfer, bigint][];
  held: { shares: bigint; value?: bigint };
  heldRequests?: { id: bigint; value: bigint | undefined }[];
}): YieldResult {
  const events: YieldEvents = { deposits: [], requests: [], claims: [], ...args.events };
  const movements = classifyTransfers({ user: USER, redeemer: REDEEMER, transfers: args.transfers, events });
  return computeYield({
    movements,
    claims: events.claims,
    values: new Map((args.values ?? []).map(([t, v]) => [movementKey(t), v])),
    held: { shares: args.held.shares, value: args.held.value },
    heldRequests: args.heldRequests ?? [],
  });
}

describe("earnings on a Machine", () => {
  it("costs each deposit of a series at its own share price", () => {
    // 100 assets a month at prices 1.00, 1.25 and 2.00: 100 + 80 + 50 shares.
    const result = run({
      transfers: [mint(1, 100n * 10n ** 6n), mint(2, 80n * 10n ** 6n), mint(3, 50n * 10n ** 6n)],
      events: {
        deposits: [
          { txHash: tx(1), assets: 100n * 10n ** 6n, shares: 100n * 10n ** 6n },
          { txHash: tx(2), assets: 100n * 10n ** 6n, shares: 80n * 10n ** 6n },
          { txHash: tx(3), assets: 100n * 10n ** 6n, shares: 50n * 10n ** 6n },
        ],
      },
      // 230 shares at 2.00.
      held: { shares: 230n * 10n ** 6n, value: 460n * 10n ** 6n },
    });
    expect(result).toEqual({
      ok: true,
      current: 160n * 10n ** 6n,
      past: 0n,
      total: 160n * 10n ** 6n,
      costBasis: 300n * 10n ** 6n,
    });
  });

  it("splits a partial redemption at average cost, and counts what the request paid", () => {
    // 100 shares for 100; 40 redeemed for 44 (claimed); 60 left worth 66.
    const result = run({
      transfers: [mint(1, 100n), toRedeemer(2, 40n)],
      events: {
        deposits: [{ txHash: tx(1), assets: 100n * 1000n, shares: 100n }],
        requests: [{ txHash: tx(2), requestId: 7n, shares: 40n }],
        claims: [{ requestId: 7n, assets: 44n * 1000n }],
      },
      held: { shares: 60n, value: 66n * 1000n },
    });
    expect(result).toEqual({ ok: true, current: 6000n, past: 4000n, total: 10_000n, costBasis: 60_000n });
  });

  it("values a pending or claimable request at what it pays now", () => {
    const result = run({
      transfers: [mint(1, 100n), toRedeemer(2, 100n)],
      events: {
        deposits: [{ txHash: tx(1), assets: 100_000n, shares: 100n }],
        requests: [{ txHash: tx(2), requestId: 3n, shares: 100n }],
      },
      held: { shares: 0n },
      heldRequests: [{ id: 3n, value: 103_000n }],
    });
    expect(result).toEqual({ ok: true, current: 0n, past: 3000n, total: 3000n, costBasis: 0n });
  });

  it("prices shares bought on a DEX or Pendle, and shares sent to a lending market, at the share price then", () => {
    const bought = transfer(1, DEX, USER, 100n);
    const sent = transfer(5, USER, OTHER, 50n);
    const result = run({
      transfers: [bought, sent],
      values: [
        [bought, 100_000n],
        [sent, 60_000n],
      ],
      held: { shares: 50n, value: 65_000n },
    });
    // 50 sent at 1.2 cost 50 at 1.0: +10; 50 held at 1.3: +15.
    expect(result).toEqual({ ok: true, current: 15_000n, past: 10_000n, total: 25_000n, costBasis: 50_000n });
  });

  it("treats shares minted by a pre-deposit vault (no Deposit) as received, priced like any transfer", () => {
    const preDeposit = mint(1, 100n);
    const result = run({
      transfers: [preDeposit],
      values: [[preDeposit, 100_000n]],
      held: { shares: 100n, value: 102_000n },
    });
    expect(result).toMatchObject({ ok: true, total: 2000n });
  });

  it("treats a request made for another wallet as shares sent", () => {
    const out = toRedeemer(2, 100n);
    const result = run({
      transfers: [mint(1, 100n), out],
      events: { deposits: [{ txHash: tx(1), assets: 100_000n, shares: 100n }] },
      values: [[out, 105_000n]],
      held: { shares: 0n },
    });
    expect(result).toEqual({ ok: true, current: 0n, past: 5000n, total: 5000n, costBasis: 0n });
  });

  it("has no figure when a request was made for this wallet by another one", () => {
    const result = run({
      transfers: [],
      events: { requests: [{ txHash: tx(2), requestId: 1n, shares: 10n }] },
      held: { shares: 0n },
      heldRequests: [{ id: 1n, value: 10n }],
    });
    expect(result).toEqual({ ok: false, gap: "request" });
  });

  it("has no figure when the wallet holds a request it did not create, or created one it no longer holds", () => {
    const base = {
      transfers: [mint(1, 100n), toRedeemer(2, 100n)],
      events: {
        deposits: [{ txHash: tx(1), assets: 100n, shares: 100n }],
        requests: [{ txHash: tx(2), requestId: 1n, shares: 100n }],
      },
      held: { shares: 0n },
    };
    expect(run({ ...base, heldRequests: [] })).toEqual({ ok: false, gap: "request" });
    expect(
      run({
        ...base,
        heldRequests: [
          { id: 1n, value: 100n },
          { id: 9n, value: 5n },
        ],
      }),
    ).toEqual({
      ok: false,
      gap: "request",
    });
  });

  it("has no figure when the movements do not add up to the balance", () => {
    const result = run({
      transfers: [mint(1, 100n)],
      events: { deposits: [{ txHash: tx(1), assets: 100n, shares: 100n }] },
      held: { shares: 150n, value: 150n },
    });
    expect(result).toEqual({ ok: false, gap: "balance" });
  });

  it("has no figure when a transfer could not be priced", () => {
    const result = run({ transfers: [transfer(1, DEX, USER, 100n)], held: { shares: 100n, value: 100n } });
    expect(result).toEqual({ ok: false, gap: "unpriced" });
  });

  it("has no figure when a current value is unknown", () => {
    const result = run({
      transfers: [mint(1, 100n)],
      events: { deposits: [{ txHash: tx(1), assets: 100n, shares: 100n }] },
      held: { shares: 100n, value: undefined },
    });
    expect(result).toEqual({ ok: false, gap: "unknownValue" });
  });

  it("shows rounding right after a deposit as nothing earned", () => {
    const result = run({
      transfers: [mint(1, 999_999_999_999n)],
      events: { deposits: [{ txHash: tx(1), assets: 1_000_000n, shares: 999_999_999_999n }] },
      held: { shares: 999_999_999_999n, value: 999_999n },
    });
    expect(result).toMatchObject({ ok: true, total: 0n });
  });

  it("shows a loss as a loss", () => {
    const result = run({
      transfers: [mint(1, 100n)],
      events: { deposits: [{ txHash: tx(1), assets: 100_000n, shares: 100n }] },
      held: { shares: 100n, value: 90_000n },
    });
    expect(result).toMatchObject({ ok: true, current: -10_000n, total: -10_000n });
  });

  it("ignores transfers to self", () => {
    const result = run({
      transfers: [mint(1, 100n), transfer(2, USER, USER, 100n)],
      events: { deposits: [{ txHash: tx(1), assets: 100_000n, shares: 100n }] },
      held: { shares: 100n, value: 101_000n },
    });
    expect(result).toMatchObject({ ok: true, total: 1000n });
  });

  it("keeps the split exact: current + past = value now + exits − entries", () => {
    // Uneven amounts so the average-cost division rounds.
    const sent = transfer(3, USER, OTHER, 33n);
    const result = run({
      transfers: [mint(1, 70n), mint(2, 29n), sent],
      events: {
        deposits: [
          { txHash: tx(1), assets: 70_001n, shares: 70n },
          { txHash: tx(2), assets: 31_337n, shares: 29n },
        ],
      },
      values: [[sent, 40_000n]],
      held: { shares: 66n, value: 77_777n },
    });
    expect(result.ok && result.total).toBe(77_777n + 40_000n - 70_001n - 31_337n);
  });
});
