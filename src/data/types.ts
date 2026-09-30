import type { Address } from "viem";

import type { HubInstance } from "@/config/instances";
import type { MachineRef } from "@/data/machines";

export type { MachineRef };

/**
 * Everything the app reads about a Machine, in two multicalls per chain (fetch-machine-data.ts). Every field
 * below `shareToken` is optional: a failed read blanks that field only.
 */
export type MachineData = {
  chainId: number;
  instanceId: string;
  /** Only built-in hubs are verified; Machines of other hubs stay read-only until the user unlocks the hub. */
  verifiedHub: boolean;
  machine: Address;
  /** The factory that reports this Machine through `isMachine`. */
  factory: Address;
  shareToken: Address;
  /** `shareToken.minter()`: the Machine itself once it is live (a pre-deposit vault before migration). */
  shareMinter?: Address;

  accountingToken?: Address;
  depositor?: Address;
  redeemer?: Address;
  feeManager?: Address;
  lastTotalAum?: bigint;
  lastGlobalAccountingTime?: bigint;
  caliberStaleThreshold?: bigint;
  shareLimit?: bigint;
  maxMint?: bigint;
  recoveryMode?: boolean;
  /** `convertToAssets(10 ** share.decimals)`: accounting-token units per whole share. */
  sharePrice?: bigint;

  roles: {
    operator?: Address;
    mechanic?: Address;
    riskManager?: Address;
    securityCouncil?: Address;
  };
  share: { name?: string; symbol?: string; decimals?: number; totalSupply?: bigint };
  accounting: { name?: string; symbol?: string; decimals?: number };

  depositorInfo: {
    implemId?: number;
    peripheryRegistry?: Address;
    isWhitelistEnabled?: boolean;
    isSanctionsCheckEnabled?: boolean;
    sanctionsOracle?: Address;
  };
  redeemerInfo: {
    implemId?: number;
    peripheryRegistry?: Address;
    nextRequestId?: bigint;
    lastFinalizedRequestId?: bigint;
    finalizationDelay?: bigint;
    minRedeemAmount?: bigint;
    isWhitelistEnabled?: boolean;
    isSanctionsCheckEnabled?: boolean;
    sanctionsOracle?: Address;
    /** Only on AsyncRedeemerFee (1e18 = 100 %). */
    redeemFeeRate?: bigint;
  };
  feeManagerInfo: {
    implemId?: number;
    mgmtFeeRatePerSecond?: bigint;
    smFeeRatePerSecond?: bigint;
    perfFeeRate?: bigint;
  };
};

/** Queue health for one redeemer, from its storage (request-times.ts). */
export type QueueHealth = {
  /** Unix seconds at which the oldest pending request was created; undefined when unknown. */
  oldestPendingRequestTime?: bigint;
};

export type LoadPhase = "machines" | "machineData" | "health" | "ready";

/** Conditions that make an instance's data less trustworthy than usual, shown next to its status line. */
export type InstanceWarning =
  /** A built-in factory's implementation differs from the one this release was checked against. */
  | { kind: "factoryUpgraded"; factory: Address }
  /** Earlier factories could not be checked (the RPCs serve no historical state): Machines may be missing. */
  | { kind: "factoryHistoryUnknown" }
  /** The periphery registry the Machines report is not the configured one. */
  | { kind: "peripheryMismatch"; reported: Address };

/** What one hub instance's scanner has found so far. */
export type InstanceSnapshot = {
  instance: HubInstance;
  phase: LoadPhase;
  factories?: Address[];
  peripheryFactory?: Address;
  machines: MachineRef[];
  machineData: Record<string, MachineData>;
  queueHealth: Record<string, QueueHealth>;
  /** When the Machine data was last fetched successfully (ms). */
  dataUpdatedAt?: number;
  warnings: InstanceWarning[];
  /** Set while loading makes no progress for a while (ms since the last progress), typically rate-limited RPCs. */
  stalledForMs?: number;
  /** The last error for this instance; stale data stays visible alongside it. */
  error?: string;
  refetch?: () => void;
};
