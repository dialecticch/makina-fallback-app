import { type Address, type PublicClient, zeroAddress } from "viem";

import {
  asyncRedeemerFeeAbi,
  directDepositorAbi,
  hubPeripheryFactoryAbi,
  machineAbi,
  machineShareAbi,
  watermarkFeeManagerAbi,
} from "@/abis";
import type { MachineData, MachineRef } from "@/data/types";
import { asAddress, asBigint, asBool, asNumber, asString, call, readBatch, type ViewName } from "@/lib/calls";
import { chainText } from "@/lib/format";

const live = (a: Address | undefined): a is Address => a !== undefined && a !== zeroAddress;

/**
 * Everything about a chain's Machines in two rounds of multicalls. The first reads the Machines and share tokens;
 * the second reads what the first pointed at (accounting token, depositor, redeemer, fee manager, implementation
 * IDs, share price).
 */
export async function fetchMachineData(
  client: PublicClient,
  args: {
    chainId: number;
    instanceId: string;
    verifiedHub: boolean;
    machines: readonly MachineRef[];
    peripheryFactory: Address | undefined;
  },
): Promise<Record<string, MachineData>> {
  const machines: MachineData[] = args.machines.map((ref) => ({
    chainId: args.chainId,
    instanceId: args.instanceId,
    verifiedHub: args.verifiedHub,
    machine: ref.machine,
    factory: ref.factory,
    shareToken: ref.shareToken,
    roles: {},
    share: {},
    accounting: {},
    depositorInfo: {},
    redeemerInfo: {},
    feeManagerInfo: {},
  }));

  // MARK: Round 1: Machine and share token
  const round1 = readBatch<MachineData>();
  machines.forEach((d, i) => {
    const m = (fn: ViewName<typeof machineAbi>, slot: (x: MachineData, v: unknown) => void) =>
      round1.add(i, call(d.machine, machineAbi, fn), slot);
    m("accountingToken", (x, v) => (x.accountingToken = asAddress(v)));
    m("depositor", (x, v) => (x.depositor = asAddress(v)));
    m("redeemer", (x, v) => (x.redeemer = asAddress(v)));
    m("feeManager", (x, v) => (x.feeManager = asAddress(v)));
    m("lastTotalAum", (x, v) => (x.lastTotalAum = asBigint(v)));
    m("lastGlobalAccountingTime", (x, v) => (x.lastGlobalAccountingTime = asBigint(v)));
    m("caliberStaleThreshold", (x, v) => (x.caliberStaleThreshold = asBigint(v)));
    m("shareLimit", (x, v) => (x.shareLimit = asBigint(v)));
    m("maxMint", (x, v) => (x.maxMint = asBigint(v)));
    m("recoveryMode", (x, v) => (x.recoveryMode = asBool(v)));
    m("operator", (x, v) => (x.roles.operator = asAddress(v)));
    m("mechanic", (x, v) => (x.roles.mechanic = asAddress(v)));
    m("riskManager", (x, v) => (x.roles.riskManager = asAddress(v)));
    m("securityCouncil", (x, v) => (x.roles.securityCouncil = asAddress(v)));
    const s = (fn: ViewName<typeof machineShareAbi>, slot: (x: MachineData, v: unknown) => void) =>
      round1.add(i, call(d.shareToken, machineShareAbi, fn), slot);
    s("name", (x, v) => (x.share.name = chainText(asString(v))));
    s("symbol", (x, v) => (x.share.symbol = chainText(asString(v))));
    s("decimals", (x, v) => (x.share.decimals = asNumber(v)));
    s("totalSupply", (x, v) => (x.share.totalSupply = asBigint(v)));
    s("minter", (x, v) => (x.shareMinter = asAddress(v)));
  });
  await round1.run(client, machines);

  // MARK: Round 2: everything the Machine points at
  const round2 = readBatch<MachineData>();
  const pf = args.peripheryFactory;
  machines.forEach((d, i) => {
    if (live(d.accountingToken)) {
      const token = d.accountingToken;
      round2.add(
        i,
        call(token, machineShareAbi, "name"),
        (x, v) => (x.accounting.name = chainText(asString(v))),
        "external",
      );
      round2.add(
        i,
        call(token, machineShareAbi, "symbol"),
        (x, v) => (x.accounting.symbol = chainText(asString(v))),
        "external",
      );
      round2.add(
        i,
        call(token, machineShareAbi, "decimals"),
        (x, v) => (x.accounting.decimals = asNumber(v)),
        "external",
      );
    }
    if (d.share.decimals !== undefined) {
      round2.add(
        i,
        call(d.machine, machineAbi, "convertToAssets", [10n ** BigInt(d.share.decimals)]),
        (x, v) => (x.sharePrice = asBigint(v)),
      );
    }
    if (live(d.depositor)) {
      const dep = d.depositor;
      round2.add(
        i,
        call(dep, directDepositorAbi, "peripheryRegistry"),
        (x, v) => (x.depositorInfo.peripheryRegistry = asAddress(v)),
      );
      round2.add(
        i,
        call(dep, directDepositorAbi, "isWhitelistEnabled"),
        (x, v) => (x.depositorInfo.isWhitelistEnabled = asBool(v)),
      );
      round2.add(
        i,
        call(dep, directDepositorAbi, "isSanctionsCheckEnabled"),
        (x, v) => (x.depositorInfo.isSanctionsCheckEnabled = asBool(v)),
      );
      round2.add(
        i,
        call(dep, directDepositorAbi, "sanctionsOracle"),
        (x, v) => (x.depositorInfo.sanctionsOracle = asAddress(v)),
      );
      if (pf) {
        round2.add(
          i,
          call(pf, hubPeripheryFactoryAbi, "depositorImplemId", [dep]),
          (x, v) => (x.depositorInfo.implemId = asNumber(v)),
        );
      }
    }
    if (live(d.redeemer)) {
      const red = d.redeemer;
      // AsyncRedeemerFee's ABI is a superset of AsyncRedeemer's; `redeemFeeRate` simply fails on the base variant.
      const r = (fn: ViewName<typeof asyncRedeemerFeeAbi>, slot: (x: MachineData, v: unknown) => void) =>
        round2.add(i, call(red, asyncRedeemerFeeAbi, fn), slot);
      r("peripheryRegistry", (x, v) => (x.redeemerInfo.peripheryRegistry = asAddress(v)));
      r("nextRequestId", (x, v) => (x.redeemerInfo.nextRequestId = asBigint(v)));
      r("lastFinalizedRequestId", (x, v) => (x.redeemerInfo.lastFinalizedRequestId = asBigint(v)));
      r("finalizationDelay", (x, v) => (x.redeemerInfo.finalizationDelay = asBigint(v)));
      r("minRedeemAmount", (x, v) => (x.redeemerInfo.minRedeemAmount = asBigint(v)));
      r("isWhitelistEnabled", (x, v) => (x.redeemerInfo.isWhitelistEnabled = asBool(v)));
      r("isSanctionsCheckEnabled", (x, v) => (x.redeemerInfo.isSanctionsCheckEnabled = asBool(v)));
      r("sanctionsOracle", (x, v) => (x.redeemerInfo.sanctionsOracle = asAddress(v)));
      r("redeemFeeRate", (x, v) => (x.redeemerInfo.redeemFeeRate = asBigint(v)));
      if (pf) {
        round2.add(
          i,
          call(pf, hubPeripheryFactoryAbi, "redeemerImplemId", [red]),
          (x, v) => (x.redeemerInfo.implemId = asNumber(v)),
        );
      }
    }
    if (live(d.feeManager)) {
      const fm = d.feeManager;
      round2.add(
        i,
        call(fm, watermarkFeeManagerAbi, "mgmtFeeRatePerSecond"),
        (x, v) => (x.feeManagerInfo.mgmtFeeRatePerSecond = asBigint(v)),
      );
      round2.add(
        i,
        call(fm, watermarkFeeManagerAbi, "smFeeRatePerSecond"),
        (x, v) => (x.feeManagerInfo.smFeeRatePerSecond = asBigint(v)),
      );
      round2.add(
        i,
        call(fm, watermarkFeeManagerAbi, "perfFeeRate"),
        (x, v) => (x.feeManagerInfo.perfFeeRate = asBigint(v)),
      );
      if (pf) {
        round2.add(
          i,
          call(pf, hubPeripheryFactoryAbi, "feeManagerImplemId", [fm]),
          (x, v) => (x.feeManagerInfo.implemId = asNumber(v)),
        );
      }
    }
  });
  await round2.run(client, machines);

  return Object.fromEntries(machines.map((d) => [d.machine.toLowerCase(), d]));
}
