import type { Address, Hash } from "viem";

import type { HubInstance } from "@/config/instances";

/** A user's standing with one Machine (fetch-user-data.ts). Undefined fields are failed reads. */
export type UserMachineState = {
  machine: Address;
  shares?: bigint;
  /** `convertToAssets(shares)`, in accounting-token units. */
  value?: bigint;
  accountingBalance?: bigint;
  /** Accounting token allowance to the depositor. */
  depositAllowance?: bigint;
  /** Share token allowance to the redeemer. */
  redeemAllowance?: bigint;
  /** Redemption request NFTs held (ERC721 `balanceOf` on the redeemer). */
  requestNfts?: bigint;
  depositorWhitelisted?: boolean;
  redeemerWhitelisted?: boolean;
  /** `isSanctioned(user)` on the depositor's and redeemer's oracles, when they have one. */
  depositorSanctioned?: boolean;
  redeemerSanctioned?: boolean;
};

export type RedemptionRequest = {
  chainId: number;
  machine: Address;
  redeemer: Address;
  id: bigint;
  shares?: bigint;
  /** `id <= lastFinalizedRequestId`: the assets are fixed and can be claimed. */
  claimable: boolean;
  claimableAssets?: bigint;
  /** Pending only: `convertToAssets(shares)` less any redeem fee. The final amount can only be lower. */
  estimatedAssets?: bigint;
  /** Unix seconds of the request's creation, from the redeemer's storage, when known. */
  requestTime?: bigint;
};

export type ActivityItem = {
  kind: "deposit" | "request" | "claim";
  chainId: number;
  machine: Address;
  txHash: Hash;
  blockNumber: bigint;
  logIndex: number;
  time?: bigint;
  assets?: bigint;
  shares?: bigint;
  requestId?: bigint;
};

export type UserSnapshot = {
  instance: HubInstance;
  user: Address;
  /** Balances and pre-check reads are loaded (they can be refreshed afterwards). */
  balancesReady: boolean;
  /** The user's redemption requests are loaded. */
  requestsReady: boolean;
  nativeBalance?: bigint;
  byMachine: Record<string, UserMachineState>;
  requests: RedemptionRequest[];
  updatedAt?: number;
  error?: string;
  refetch?: () => void;
};
