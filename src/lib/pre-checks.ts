import { type Address, zeroAddress } from "viem";

import type { MachineView } from "@/data/machine-view";
import type { UserMachineState } from "@/data/user-types";

export type ActionKind = "deposit" | "redeem" | "claim" | "wrap";

/** Who is acting, from which chain, and their reads: what `useActionContext` provides. */
export type PreCheckContext = {
  readOnly: boolean;
  account: Address | undefined;
  walletChainId: number | undefined;
  chainName: string;
  user: UserMachineState | undefined;
  nativeBalance: bigint | undefined;
  /** The user unlocked this (unverified) hub in Settings or on the Machine page. */
  hubUnlocked: boolean;
};

export type PreCheckCode =
  | "readOnly"
  | "noWallet"
  | "wrongChain"
  | "hubLocked"
  | "recoveryMode"
  | "closed"
  | "notLoaded"
  | "unsupported"
  | "notWhitelisted"
  | "sanctioned"
  | "noGas";

export type PreCheckResult =
  { ok: true } | { ok: false; code: PreCheckCode; reason: string; fix?: "connect" | "switchChain" | "unlock" };

const CLOSED: Record<Exclude<ActionKind, "wrap">, string> = {
  deposit: "Deposits closed: this Machine has no depositor.",
  redeem: "Redemptions closed: this Machine has no redeemer.",
  claim: "Redemptions closed: this Machine has no redeemer.",
};

const fail = (code: PreCheckCode, reason: string, fix?: "connect" | "switchChain" | "unlock"): PreCheckResult => ({
  ok: false,
  code,
  reason,
  fix,
});

/** The shared pre-checks: the first failing one disables the button with a one-line reason. */
export function preCheckFor(action: ActionKind, view: MachineView, ctx: PreCheckContext): PreCheckResult {
  const { data } = view;
  if (ctx.readOnly) return fail("readOnly", "Connect this wallet to act.");
  if (!ctx.account) return fail("noWallet", "Connect a wallet to continue.", "connect");
  if (ctx.walletChainId !== data.chainId)
    return fail("wrongChain", `Switch your wallet to ${ctx.chainName}.`, "switchChain");

  if (action !== "wrap") {
    // Claims need no approval and pay the NFT's owner, so they stay possible on a locked hub.
    if ((action === "deposit" || action === "redeem") && !data.verifiedHub && !ctx.hubUnlocked) {
      return fail("hubLocked", "Unlock this hub first (see above).", "unlock");
    }
    if ((action === "deposit" || action === "redeem") && data.recoveryMode) {
      return fail("recoveryMode", "Recovery mode: only claims are possible.");
    }
    const deposit = action === "deposit";
    const contract = deposit ? data.depositor : data.redeemer;
    const supported = deposit ? view.depositorSupported : view.redeemerSupported;
    if (contract === zeroAddress) return fail("closed", CLOSED[action]);
    if (contract === undefined || supported === undefined) {
      return fail("notLoaded", "Contract details not loaded yet.");
    }
    if (!supported) return fail("unsupported", "Unsupported contract type: read-only here.");
    const info = deposit ? data.depositorInfo : data.redeemerInfo;
    const whitelisted = deposit ? ctx.user?.depositorWhitelisted : ctx.user?.redeemerWhitelisted;
    const sanctioned = deposit ? ctx.user?.depositorSanctioned : ctx.user?.redeemerSanctioned;
    if (info.isWhitelistEnabled && whitelisted === false) {
      return fail("notWhitelisted", "This address is not on this Machine's whitelist.");
    }
    if (info.isSanctionsCheckEnabled && sanctioned) return fail("sanctioned", "This address cannot use this Machine.");
  }
  if (ctx.nativeBalance !== undefined && ctx.nativeBalance === 0n) {
    return fail("noGas", `You need gas on ${ctx.chainName}.`);
  }
  return { ok: true };
}
