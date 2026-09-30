import { type Address, maxUint256, zeroAddress } from "viem";

import {
  type DepositorKind,
  type FeeManagerKind,
  IMPLEM_IDS,
  QUEUE_STALL_GRACE_SECONDS,
  type RedeemerKind,
} from "@/config/constants";

/** All Makina rates use 1e18 = 100 %. */
export const WAD = 10n ** 18n;
export const SECONDS_PER_YEAR = 31_536_000n;

/** Per-second fee rate (1e18 = 100 %) to an annual rate, same scale. */
export function annualize(ratePerSecond: bigint): bigint {
  return ratePerSecond * SECONDS_PER_YEAR;
}

export type CapUsage = { kind: "none" } | { kind: "full" } | { kind: "partial"; ratio: number };

/** `totalSupply / shareLimit`, with "No cap" for `type(uint256).max` and "Full" when `maxMint` is 0. */
export function capUsage(args: {
  shareLimit: bigint | undefined;
  maxMint: bigint | undefined;
  totalSupply: bigint | undefined;
}): CapUsage | undefined {
  const { shareLimit, maxMint, totalSupply } = args;
  if (shareLimit === maxUint256) return { kind: "none" };
  if (maxMint === 0n) return { kind: "full" };
  if (shareLimit === undefined || totalSupply === undefined) return undefined;
  if (shareLimit === 0n) return { kind: "full" };
  // 4 decimal places of precision is plenty for a bar and a percentage.
  const ratio = Number((totalSupply * 10_000n) / shareLimit) / 10_000;
  return { kind: "partial", ratio: Math.min(ratio, 1) };
}

export type Access = "Open" | "Whitelisted" | "Closed";

export function access(args: {
  depositor: Address | undefined;
  recoveryMode: boolean | undefined;
  isWhitelistEnabled: boolean | undefined;
}): Access | undefined {
  if (args.depositor === zeroAddress || args.recoveryMode === true) return "Closed";
  if (args.depositor === undefined || args.recoveryMode === undefined) return undefined;
  if (args.isWhitelistEnabled === undefined) return undefined;
  return args.isWhitelistEnabled ? "Whitelisted" : "Open";
}

export function isAccountingStale(args: {
  nowSeconds: bigint;
  lastGlobalAccountingTime: bigint | undefined;
  caliberStaleThreshold: bigint | undefined;
}): boolean | undefined {
  const { nowSeconds, lastGlobalAccountingTime, caliberStaleThreshold } = args;
  if (lastGlobalAccountingTime === undefined || caliberStaleThreshold === undefined) return undefined;
  return nowSeconds - lastGlobalAccountingTime > caliberStaleThreshold;
}

/** Requests minted but not yet finalized: `nextRequestId - 1 - lastFinalizedRequestId`. */
export function pendingRequestCount(
  nextRequestId: bigint | undefined,
  lastFinalizedRequestId: bigint | undefined,
): bigint | undefined {
  if (nextRequestId === undefined || lastFinalizedRequestId === undefined) return undefined;
  const pending = nextRequestId - 1n - lastFinalizedRequestId;
  return pending > 0n ? pending : 0n;
}

/**
 * The queue is stalled when its oldest pending request is past its earliest finalization time
 * (request time + `finalizationDelay`) by more than the grace period. Unknown when the request time is.
 */
export function isQueueStalled(args: {
  nowSeconds: bigint;
  pending: bigint | undefined;
  oldestPendingRequestTime: bigint | undefined;
  finalizationDelay: bigint | undefined;
}): boolean | undefined {
  const { nowSeconds, pending, oldestPendingRequestTime, finalizationDelay } = args;
  if (pending === 0n) return false;
  if (pending === undefined || finalizationDelay === undefined || oldestPendingRequestTime === undefined) {
    return undefined;
  }
  return nowSeconds > oldestPendingRequestTime + finalizationDelay + QUEUE_STALL_GRACE_SECONDS;
}

export type RequestStatus = "claimable" | "waitingForDelay" | "awaitingMechanic" | "stalled" | "pending";

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  claimable: "Claimable",
  waitingForDelay: "Waiting for delay",
  awaitingMechanic: "Awaiting mechanic",
  stalled: "Stalled",
  pending: "Pending",
};

/**
 * Status of one of the user's redemption requests. Finalized IDs (`id <= lastFinalizedRequestId`) are claimable;
 * pending ones wait for `finalizationDelay`, then for the mechanic, and count as stalled after the grace period.
 */
export function requestStatus(args: {
  id: bigint;
  lastFinalizedRequestId: bigint | undefined;
  requestTime: bigint | undefined;
  finalizationDelay: bigint | undefined;
  nowSeconds: bigint;
}): RequestStatus {
  if (args.lastFinalizedRequestId !== undefined && args.id <= args.lastFinalizedRequestId) return "claimable";
  if (args.requestTime === undefined || args.finalizationDelay === undefined) return "pending";
  const earliest = args.requestTime + args.finalizationDelay;
  if (args.nowSeconds < earliest) return "waitingForDelay";
  if (args.nowSeconds > earliest + QUEUE_STALL_GRACE_SECONDS) return "stalled";
  return "awaitingMechanic";
}

export function depositorKind(implemId: number | undefined): DepositorKind | undefined {
  return implemId === undefined ? undefined : (IMPLEM_IDS.depositor as Record<number, DepositorKind>)[implemId];
}

export function redeemerKind(implemId: number | undefined): RedeemerKind | undefined {
  return implemId === undefined ? undefined : (IMPLEM_IDS.redeemer as Record<number, RedeemerKind>)[implemId];
}

export function feeManagerKind(implemId: number | undefined): FeeManagerKind | undefined {
  return implemId === undefined ? undefined : (IMPLEM_IDS.feeManager as Record<number, FeeManagerKind>)[implemId];
}

/** `assets` less the redeem fee (1e18 = 100 %), rounded down like `AsyncRedeemerFee._previewRedeem`. */
export function lessRedeemFee(assets: bigint, redeemFeeRate: bigint | undefined): bigint {
  if (!redeemFeeRate) return assets;
  return (assets * (WAD - redeemFeeRate)) / WAD;
}

/** `amount × (1 − slippage)`, rounded down so the minimum is never above what the user accepted. */
export function applySlippage(amount: bigint, slippageBps: number): bigint {
  const bps = BigInt(Math.round(slippageBps));
  if (bps < 0n || bps > 10_000n) throw new Error(`Invalid slippage: ${slippageBps} bps`);
  return (amount * (10_000n - bps)) / 10_000n;
}

// MARK: Status badge

export type StatusCondition =
  "recoveryMode" | "accountingStale" | "queueStalled" | "depositsClosed" | "unsupportedContracts";

export type Status = StatusCondition | "healthy";

export const STATUS_META: Record<Status, { label: string; tone: "red" | "yellow" | "grey" | "teal" }> = {
  recoveryMode: { label: "Recovery mode", tone: "red" },
  accountingStale: { label: "Accounting stale", tone: "yellow" },
  queueStalled: { label: "Queue stalled", tone: "yellow" },
  depositsClosed: { label: "Deposits closed", tone: "grey" },
  unsupportedContracts: { label: "Unsupported contracts", tone: "grey" },
  healthy: { label: "Healthy", tone: "teal" },
};

/** Highest severity first; the badge shows the first active one (and Explore sorts by it). */
export const STATUS_PRECEDENCE: StatusCondition[] = [
  "recoveryMode",
  "accountingStale",
  "queueStalled",
  "depositsClosed",
  "unsupportedContracts",
];

export function statusConditions(args: {
  recoveryMode: boolean | undefined;
  accountingStale: boolean | undefined;
  queueStalled: boolean | undefined;
  depositor: Address | undefined;
  redeemer: Address | undefined;
  depositorSupported: boolean | undefined;
  redeemerSupported: boolean | undefined;
}): StatusCondition[] {
  const active = new Set<StatusCondition>();
  if (args.recoveryMode) active.add("recoveryMode");
  if (args.accountingStale) active.add("accountingStale");
  if (args.queueStalled) active.add("queueStalled");
  if (args.depositor === zeroAddress) active.add("depositsClosed");
  const unsupportedDepositor = args.depositor !== zeroAddress && args.depositorSupported === false;
  const unsupportedRedeemer = args.redeemer !== zeroAddress && args.redeemerSupported === false;
  if (unsupportedDepositor || unsupportedRedeemer) active.add("unsupportedContracts");
  return STATUS_PRECEDENCE.filter((c) => active.has(c));
}

export function topStatus(conditions: readonly StatusCondition[]): Status {
  return conditions[0] ?? "healthy";
}
