import type { Address, Hex } from "viem";

// Kept free of `@/` imports so Node scripts can import it directly.

/**
 * Bump whenever the shape of any persisted query changes, so stale caches are dropped instead of misread.
 */
export const CACHE_BUSTER = "v2";

/** How long cached chain data lives, in memory (TanStack `gcTime`) and in localStorage (persister `maxAge`). */
export const QUERY_GC_TIME_MS = 7 * 24 * 60 * 60 * 1_000;

/**
 * Periphery implementation IDs the app knows how to drive, as returned by the HubPeripheryFactory's
 * `depositorImplemId`, `redeemerImplemId` and `feeManagerImplemId`. Any other ID, or a contract the factory did not
 * create, makes that part of the Machine read-only.
 *
 * Confirmed with `pnpm check-implem-ids` on 2026-09-30: every factory-created depositor, redeemer and fee manager
 * on the Ethereum hub (13 Machines) and the Base hub (9 Machines) is 1001, 2001 or 3001. The three "Internal"
 * Machines on Ethereum use a combined depositor and redeemer that the periphery factory did not create, so they
 * are read-only here. No live Machine uses 2002 yet.
 */
export const IMPLEM_IDS = {
  depositor: { 1001: "DirectDepositor" },
  redeemer: { 2001: "AsyncRedeemer", 2002: "AsyncRedeemerFee" },
  feeManager: { 3001: "WatermarkFeeManager" },
} as const satisfies Record<string, Record<number, string>>;

export type DepositorKind = (typeof IMPLEM_IDS.depositor)[keyof typeof IMPLEM_IDS.depositor];
export type RedeemerKind = (typeof IMPLEM_IDS.redeemer)[keyof typeof IMPLEM_IDS.redeemer];
export type FeeManagerKind = (typeof IMPLEM_IDS.feeManager)[keyof typeof IMPLEM_IDS.feeManager];

/** `DirectDepositor.deposit` takes a referral key; this app never uses one. */
export const NO_REFERRAL: Hex = "0x0000000000000000000000000000000000000000000000000000000000000000";

/** A pending request is "stalled" this long after its earliest possible finalization. */
export const QUEUE_STALL_GRACE_SECONDS = 72n * 60n * 60n;

export function machineKey(chainId: number, machine: Address) {
  return `${chainId}:${machine.toLowerCase()}`;
}
