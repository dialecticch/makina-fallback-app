import { maxUint256, parseUnits, zeroAddress } from "viem";
import { describe, expect, it } from "vitest";

import {
  access,
  annualize,
  applySlippage,
  capUsage,
  isAccountingStale,
  isQueueStalled,
  lessRedeemFee,
  pendingRequestCount,
  redeemerKind,
  statusConditions,
  topStatus,
  WAD,
} from "@/lib/derive";
import { formatWadPercent } from "@/lib/format";

const SOME = "0x1111111111111111111111111111111111111111";

describe("fees", () => {
  it("annualises a per-second rate at 1e18 = 100 %", () => {
    // 2 % per year, expressed per second, rounds back to 2.00 %.
    const perSecond = (2n * WAD) / 100n / 31_536_000n;
    expect(formatWadPercent(annualize(perSecond))).toBe("2.00%");
    expect(formatWadPercent(0n)).toBe("0.00%");
    expect(formatWadPercent(WAD / 10n)).toBe("10.00%");
    expect(formatWadPercent(WAD)).toBe("100.00%");
  });

  it("applies the redeem fee like AsyncRedeemerFee (rounded down)", () => {
    expect(lessRedeemFee(1_000n, WAD / 100n)).toBe(990n);
    expect(lessRedeemFee(999n, WAD / 100n)).toBe(989n);
    expect(lessRedeemFee(1_000n, undefined)).toBe(1_000n);
  });
});

describe("capUsage", () => {
  it("reports no cap for type(uint256).max", () => {
    expect(capUsage({ shareLimit: maxUint256, maxMint: maxUint256, totalSupply: 5n })).toEqual({ kind: "none" });
  });
  it("reports full when maxMint is 0", () => {
    expect(capUsage({ shareLimit: 100n, maxMint: 0n, totalSupply: 100n })).toEqual({ kind: "full" });
  });
  it("computes the ratio", () => {
    expect(capUsage({ shareLimit: 200n, maxMint: 150n, totalSupply: 50n })).toEqual({ kind: "partial", ratio: 0.25 });
  });
  it("is unknown when reads failed", () => {
    expect(capUsage({ shareLimit: undefined, maxMint: undefined, totalSupply: 1n })).toBeUndefined();
  });
});

describe("access", () => {
  it("is closed with no depositor or in recovery mode", () => {
    expect(access({ depositor: zeroAddress, recoveryMode: false, isWhitelistEnabled: false })).toBe("Closed");
    expect(access({ depositor: SOME, recoveryMode: true, isWhitelistEnabled: false })).toBe("Closed");
  });
  it("is whitelisted or open otherwise", () => {
    expect(access({ depositor: SOME, recoveryMode: false, isWhitelistEnabled: true })).toBe("Whitelisted");
    expect(access({ depositor: SOME, recoveryMode: false, isWhitelistEnabled: false })).toBe("Open");
  });
});

describe("health", () => {
  it("flags stale accounting strictly above the threshold", () => {
    expect(isAccountingStale({ nowSeconds: 1_000n, lastGlobalAccountingTime: 400n, caliberStaleThreshold: 600n })).toBe(
      false,
    );
    expect(isAccountingStale({ nowSeconds: 1_001n, lastGlobalAccountingTime: 400n, caliberStaleThreshold: 600n })).toBe(
      true,
    );
  });

  it("counts pending requests", () => {
    expect(pendingRequestCount(1n, 0n)).toBe(0n); // fresh redeemer: nextRequestId starts at 1
    expect(pendingRequestCount(11n, 7n)).toBe(3n);
  });

  it("flags a stalled queue after delay + grace (72 h)", () => {
    const grace = 72n * 3600n;
    const base = { pending: 1n, oldestPendingRequestTime: 1_000n, finalizationDelay: 100n };
    expect(isQueueStalled({ ...base, nowSeconds: 1_100n + grace })).toBe(false);
    expect(isQueueStalled({ ...base, nowSeconds: 1_101n + grace })).toBe(true);
    expect(isQueueStalled({ ...base, pending: 0n, nowSeconds: 9_999_999n })).toBe(false);
    expect(isQueueStalled({ ...base, oldestPendingRequestTime: undefined, nowSeconds: 9_999_999n })).toBeUndefined();
  });
});

describe("status badge precedence", () => {
  const healthy = {
    recoveryMode: false,
    accountingStale: false,
    queueStalled: false,
    depositor: SOME,
    redeemer: SOME,
    depositorSupported: true,
    redeemerSupported: true,
  } as const;

  it("is healthy with no conditions", () => {
    expect(topStatus(statusConditions(healthy))).toBe("healthy");
  });

  it("puts recovery mode above everything and lists every active condition", () => {
    const conditions = statusConditions({
      ...healthy,
      recoveryMode: true,
      accountingStale: true,
      queueStalled: true,
      depositor: zeroAddress,
      redeemerSupported: false,
    });
    expect(conditions).toEqual([
      "recoveryMode",
      "accountingStale",
      "queueStalled",
      "depositsClosed",
      "unsupportedContracts",
    ]);
    expect(topStatus(conditions)).toBe("recoveryMode");
  });

  it("does not call a closed depositor unsupported", () => {
    expect(statusConditions({ ...healthy, depositor: zeroAddress, depositorSupported: false })).toEqual([
      "depositsClosed",
    ]);
  });

  it("recognises the known implementation IDs only", () => {
    expect(redeemerKind(2001)).toBe("AsyncRedeemer");
    expect(redeemerKind(2002)).toBe("AsyncRedeemerFee");
    expect(redeemerKind(2999)).toBeUndefined();
  });
});

describe("slippage", () => {
  it("rounds the minimum down", () => {
    expect(applySlippage(parseUnits("100", 6), 50)).toBe(parseUnits("99.5", 6));
    expect(applySlippage(999n, 50)).toBe(994n);
    expect(applySlippage(1_000n, 0)).toBe(1_000n);
  });
  it("rejects out-of-range slippage", () => {
    expect(() => applySlippage(1n, 10_001)).toThrow();
  });
});
