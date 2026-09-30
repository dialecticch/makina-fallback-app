import { type Address, isAddressEqual, type PublicClient, zeroAddress } from "viem";

import { asyncRedeemerFeeAbi, directDepositorAbi, machineAbi, machineShareAbi, sanctionsOracleAbi } from "@/abis";
import { readRequestTimes } from "@/data/request-times";
import type { MachineData } from "@/data/types";
import type { RedemptionRequest, UserMachineState } from "@/data/user-types";
import { asBigint, asBool, call, multicallLoose, readBatch } from "@/lib/calls";
import { lessRedeemFee, redeemerKind } from "@/lib/derive";

const live = (a: Address | undefined): a is Address => a !== undefined && a !== zeroAddress;

/**
 * For every Machine on a chain: the user's shares and their value, accounting-token balance, both allowances, the
 * number of redemption request NFTs, and the whitelist and sanctions reads the action pre-checks need.
 */
export async function fetchUserBalances(
  client: PublicClient,
  args: { user: Address; machines: readonly MachineData[] },
): Promise<{ nativeBalance?: bigint; byMachine: Record<string, UserMachineState> }> {
  const { user, machines } = args;
  const states: UserMachineState[] = machines.map((m) => ({ machine: m.machine }));
  const batch = readBatch<UserMachineState>();

  machines.forEach((m, i) => {
    batch.add(i, call(m.shareToken, machineShareAbi, "balanceOf", [user]), (s, v) => (s.shares = asBigint(v)));
    if (live(m.accountingToken)) {
      const token = m.accountingToken;
      batch.add(
        i,
        call(token, machineShareAbi, "balanceOf", [user]),
        (s, v) => (s.accountingBalance = asBigint(v)),
        "external",
      );
      if (live(m.depositor)) {
        batch.add(
          i,
          call(token, machineShareAbi, "allowance", [user, m.depositor]),
          (s, v) => (s.depositAllowance = asBigint(v)),
          "external",
        );
      }
    }
    if (live(m.depositor)) {
      batch.add(
        i,
        call(m.depositor, directDepositorAbi, "isWhitelistedUser", [user]),
        (s, v) => (s.depositorWhitelisted = asBool(v)),
      );
      if (live(m.depositorInfo.sanctionsOracle)) {
        batch.add(
          i,
          call(m.depositorInfo.sanctionsOracle, sanctionsOracleAbi, "isSanctioned", [user]),
          (s, v) => (s.depositorSanctioned = asBool(v)),
          "external",
        );
      }
    }
    if (live(m.redeemer)) {
      batch.add(
        i,
        call(m.shareToken, machineShareAbi, "allowance", [user, m.redeemer]),
        (s, v) => (s.redeemAllowance = asBigint(v)),
      );
      batch.add(
        i,
        call(m.redeemer, asyncRedeemerFeeAbi, "isWhitelistedUser", [user]),
        (s, v) => (s.redeemerWhitelisted = asBool(v)),
      );
      batch.add(i, call(m.redeemer, asyncRedeemerFeeAbi, "balanceOf", [user]), (s, v) => (s.requestNfts = asBigint(v)));
      if (live(m.redeemerInfo.sanctionsOracle)) {
        batch.add(
          i,
          call(m.redeemerInfo.sanctionsOracle, sanctionsOracleAbi, "isSanctioned", [user]),
          (s, v) => (s.redeemerSanctioned = asBool(v)),
          "external",
        );
      }
    }
  });

  const [, nativeBalance] = await Promise.all([
    batch.run(client, states),
    client.getBalance({ address: user }).catch(() => undefined),
  ]);

  // Value = convertToAssets(shares), only for non-zero positions.
  const held = states.filter((s) => s.shares !== undefined && s.shares > 0n);
  const values = await multicallLoose(
    client,
    held.map((s) => call(s.machine, machineAbi, "convertToAssets", [s.shares!])),
  );
  held.forEach((s, k) => (s.value = asBigint(values[k])));

  return { nativeBalance, byMachine: Object.fromEntries(states.map((s) => [s.machine.toLowerCase(), s])) };
}

/**
 * The user's redemption requests, from state only. The NFTs are not enumerable, but claimed requests are burned,
 * so every existing request ID below `nextRequestId` is an unclaimed request: one `ownerOf` multicall per redeemer
 * where the user holds any NFT finds them. Then shares, the claimable amount or an estimate, and the creation time.
 */
export async function fetchUserRequests(
  client: PublicClient,
  args: {
    chainId: number;
    user: Address;
    machines: readonly MachineData[];
    byMachine: Record<string, UserMachineState>;
  },
): Promise<RedemptionRequest[]> {
  const { user } = args;
  const holders = args.machines.filter(
    (m) =>
      live(m.redeemer) &&
      (args.byMachine[m.machine.toLowerCase()]?.requestNfts ?? 0n) > 0n &&
      (m.redeemerInfo.nextRequestId ?? 0n) > 1n,
  );
  if (holders.length === 0) return [];

  const ids = holders.map((m) =>
    Array.from({ length: Number(m.redeemerInfo.nextRequestId! - 1n) }, (_, i) => BigInt(i + 1)),
  );
  const owners = await multicallLoose(
    client,
    holders.flatMap((m, h) => ids[h]!.map((id) => call(m.redeemer!, asyncRedeemerFeeAbi, "ownerOf", [id]))),
  );
  let k = 0;
  const owned = holders.flatMap((m, h) =>
    ids[h]!.flatMap((id) => {
      const owner = owners[k++] as Address | undefined;
      return owner && isAddressEqual(owner, user) ? [{ m, id }] : [];
    }),
  );
  if (owned.length === 0) return [];

  const shares = await multicallLoose(
    client,
    owned.map(({ m, id }) => call(m.redeemer!, asyncRedeemerFeeAbi, "getShares", [id])),
  );
  const isFinalized = (m: MachineData, id: bigint) =>
    m.redeemerInfo.lastFinalizedRequestId !== undefined && id <= m.redeemerInfo.lastFinalizedRequestId;
  const [values, times] = await Promise.all([
    multicallLoose(
      client,
      owned.map(({ m, id }, i) =>
        isFinalized(m, id)
          ? call(m.redeemer!, asyncRedeemerFeeAbi, "getClaimableAssets", [id])
          : call(m.machine, machineAbi, "convertToAssets", [asBigint(shares[i]) ?? 0n]),
      ),
    ),
    Promise.all(
      owned.map(({ m, id }) =>
        redeemerKind(m.redeemerInfo.implemId)
          ? readRequestTimes(client, m.redeemer!, [id]).then((t) => t[0])
          : Promise.resolve(undefined),
      ),
    ),
  ]);

  return owned.map(({ m, id }, i) => {
    const claimable = isFinalized(m, id);
    const value = asBigint(values[i]);
    return {
      chainId: args.chainId,
      machine: m.machine,
      redeemer: m.redeemer!,
      id,
      shares: asBigint(shares[i]),
      claimable,
      claimableAssets: claimable ? value : undefined,
      estimatedAssets:
        !claimable && value !== undefined ? lessRedeemFee(value, m.redeemerInfo.redeemFeeRate) : undefined,
      requestTime: times[i],
    };
  });
}
