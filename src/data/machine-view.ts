import { zeroAddress } from "viem";

import { machineKey } from "@/config/constants";
import type { MachineData, QueueHealth } from "@/data/types";
import {
  access,
  annualize,
  capUsage,
  depositorKind,
  feeManagerKind,
  isAccountingStale,
  isQueueStalled,
  pendingRequestCount,
  redeemerKind,
  statusConditions,
  topStatus,
} from "@/lib/derive";

/** Everything the tables, the Machine page and the pre-checks need, derived from chain data. */
export function toMachineView(data: MachineData, health: QueueHealth | undefined, nowSeconds: bigint) {
  const depositorClosed = data.depositor === zeroAddress;
  const redeemerClosed = data.redeemer === zeroAddress;
  const depositor = depositorClosed ? undefined : depositorKind(data.depositorInfo.implemId);
  const redeemer = redeemerClosed ? undefined : redeemerKind(data.redeemerInfo.implemId);
  const feeManager = feeManagerKind(data.feeManagerInfo.implemId);

  // A contract is "unsupported" only once we know it exists and its ID is not ours (or it was not factory-made).
  const depositorSupported = data.depositor === undefined || depositorClosed ? undefined : depositor !== undefined;
  const redeemerSupported = data.redeemer === undefined || redeemerClosed ? undefined : redeemer !== undefined;

  const accountingStale = isAccountingStale({
    nowSeconds,
    lastGlobalAccountingTime: data.lastGlobalAccountingTime,
    caliberStaleThreshold: data.caliberStaleThreshold,
  });
  const pending = pendingRequestCount(data.redeemerInfo.nextRequestId, data.redeemerInfo.lastFinalizedRequestId);
  const queueStalled = redeemerClosed
    ? false
    : isQueueStalled({
        nowSeconds,
        pending,
        oldestPendingRequestTime: health?.oldestPendingRequestTime,
        finalizationDelay: data.redeemerInfo.finalizationDelay,
      });

  const conditions = statusConditions({
    recoveryMode: data.recoveryMode,
    accountingStale,
    queueStalled,
    depositor: data.depositor,
    redeemer: data.redeemer,
    depositorSupported,
    redeemerSupported,
  });

  const fm = feeManager ? data.feeManagerInfo : {};

  return {
    key: machineKey(data.chainId, data.machine),
    data,
    health,
    name: data.share.name,
    symbol: data.share.symbol,
    shareDecimals: data.share.decimals,
    accountingSymbol: data.accounting.symbol,
    accountingDecimals: data.accounting.decimals,
    tvl: data.lastTotalAum,
    sharePrice: data.sharePrice,
    fees: {
      management: fm.mgmtFeeRatePerSecond === undefined ? undefined : annualize(fm.mgmtFeeRatePerSecond),
      securityModule: fm.smFeeRatePerSecond === undefined ? undefined : annualize(fm.smFeeRatePerSecond),
      performance: fm.perfFeeRate,
      redemption: redeemer === "AsyncRedeemerFee" ? data.redeemerInfo.redeemFeeRate : redeemer ? 0n : undefined,
    },
    cap: capUsage({ shareLimit: data.shareLimit, maxMint: data.maxMint, totalSupply: data.share.totalSupply }),
    access: access({
      depositor: data.depositor,
      recoveryMode: data.recoveryMode,
      isWhitelistEnabled: data.depositorInfo.isWhitelistEnabled,
    }),
    conditions,
    status: data.recoveryMode === undefined && data.depositor === undefined ? undefined : topStatus(conditions),
    depositorKind: depositor,
    redeemerKind: redeemer,
    /** undefined while unknown; false for a contract this app cannot drive (read-only). */
    depositorSupported,
    redeemerSupported,
    /** Built into this release. Machines of other hubs are read-only until the user unlocks the hub. */
    verifiedHub: data.verifiedHub,
    feeManagerKind: feeManager,
    depositorClosed,
    redeemerClosed,
    accountingStale,
    accountingAge: data.lastGlobalAccountingTime === undefined ? undefined : nowSeconds - data.lastGlobalAccountingTime,
    pending,
    queueStalled,
  };
}

export type MachineView = ReturnType<typeof toMachineView>;
