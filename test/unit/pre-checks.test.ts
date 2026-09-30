import { zeroAddress } from "viem";
import { describe, expect, it } from "vitest";

import type { MachineData } from "@/data/types";
import { toMachineView } from "@/data/machine-view";
import { type ActionKind, type PreCheckContext, preCheckFor } from "@/lib/pre-checks";

const DEPOSITOR = "0x2222222222222222222222222222222222222222";
const REDEEMER = "0x3333333333333333333333333333333333333333";

function machine(overrides: Partial<MachineData> = {}): MachineData {
  return {
    chainId: 1,
    instanceId: "builtin-1-0x0faeeceab0bcb63be2fe984ea8c77778989d53ea",
    verifiedHub: true,
    machine: "0x4444444444444444444444444444444444444444",
    factory: "0x5555555555555555555555555555555555555555",
    shareToken: "0x6666666666666666666666666666666666666666",
    depositor: DEPOSITOR,
    redeemer: REDEEMER,
    recoveryMode: false,
    roles: {},
    share: {},
    accounting: {},
    depositorInfo: { implemId: 1001, isWhitelistEnabled: false, isSanctionsCheckEnabled: true },
    redeemerInfo: { implemId: 2001, isWhitelistEnabled: false, isSanctionsCheckEnabled: true },
    feeManagerInfo: {},
    ...overrides,
  };
}

const ctx: PreCheckContext = {
  readOnly: false,
  account: "0x1111111111111111111111111111111111111111",
  walletChainId: 1,
  chainName: "Ethereum",
  user: {
    machine: "0x4444444444444444444444444444444444444444",
    depositorWhitelisted: false,
    redeemerWhitelisted: false,
  },
  nativeBalance: 10n,
  hubUnlocked: false,
};

const check = (action: ActionKind, data = machine(), context = ctx) =>
  preCheckFor(action, toMachineView(data, undefined, 0n), context);

describe("preCheckFor", () => {
  it("passes when everything is in order", () => {
    for (const action of ["deposit", "redeem", "claim", "wrap"] as const) expect(check(action)).toEqual({ ok: true });
  });

  it("disables every write in view-only mode", () => {
    for (const action of ["deposit", "redeem", "claim", "wrap"] as const) {
      expect(check(action, machine(), { ...ctx, readOnly: true })).toMatchObject({ ok: false, code: "readOnly" });
    }
  });

  it("asks to connect, then to switch chain", () => {
    expect(check("deposit", machine(), { ...ctx, account: undefined })).toMatchObject({ fix: "connect" });
    expect(check("deposit", machine(), { ...ctx, walletChainId: 8453 })).toMatchObject({
      code: "wrongChain",
      fix: "switchChain",
      reason: expect.stringContaining("Ethereum"),
    });
  });

  it("keeps unverified hubs read-only until unlocked, except for claims", () => {
    const unverified = machine({ verifiedHub: false });
    expect(check("deposit", unverified)).toMatchObject({ code: "hubLocked", fix: "unlock" });
    expect(check("redeem", unverified)).toMatchObject({ code: "hubLocked" });
    expect(check("claim", unverified)).toEqual({ ok: true });
    expect(check("deposit", unverified, { ...ctx, hubUnlocked: true })).toEqual({ ok: true });
  });

  it("blocks deposit and request in recovery mode but never claim", () => {
    const recovering = machine({ recoveryMode: true });
    expect(check("deposit", recovering)).toMatchObject({ code: "recoveryMode" });
    expect(check("redeem", recovering)).toMatchObject({ code: "recoveryMode" });
    expect(check("claim", recovering)).toEqual({ ok: true });
  });

  it("reports closed and unsupported contracts", () => {
    expect(check("deposit", machine({ depositor: zeroAddress }))).toMatchObject({ code: "closed" });
    expect(check("redeem", machine({ redeemer: zeroAddress }))).toMatchObject({ code: "closed" });
    const unknownId = machine({ depositorInfo: { implemId: 9999 } });
    expect(check("deposit", unknownId)).toMatchObject({ code: "unsupported" });
    expect(check("deposit", machine({ depositor: undefined }))).toMatchObject({ code: "notLoaded" });
  });

  it("enforces the whitelist and sanctions only when enabled", () => {
    const whitelisted = machine({ depositorInfo: { implemId: 1001, isWhitelistEnabled: true } });
    expect(check("deposit", whitelisted)).toMatchObject({ code: "notWhitelisted" });
    expect(check("deposit", whitelisted, { ...ctx, user: { ...ctx.user!, depositorWhitelisted: true } })).toEqual({
      ok: true,
    });
    expect(check("deposit", machine(), { ...ctx, user: { ...ctx.user!, depositorSanctioned: true } })).toMatchObject({
      code: "sanctioned",
    });
    const unscreened = machine({ depositorInfo: { implemId: 1001, isSanctionsCheckEnabled: false } });
    expect(check("deposit", unscreened, { ...ctx, user: { ...ctx.user!, depositorSanctioned: true } })).toEqual({
      ok: true,
    });
  });

  it("needs gas", () => {
    expect(check("deposit", machine(), { ...ctx, nativeBalance: 0n })).toMatchObject({ code: "noGas" });
    expect(check("wrap", machine(), { ...ctx, nativeBalance: 0n })).toMatchObject({ code: "noGas" });
  });
});
