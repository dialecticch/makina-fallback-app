import { type Abi, type Address, erc20Abi, parseEther, parseUnits } from "viem";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { simulateContract } from "wagmi/actions";

import { directDepositorAbi, machineAbi } from "@/abis";
import { executePlan } from "@/actions/execute";
import { depositPlan } from "@/actions/plans";
import { TargetMismatch } from "@/actions/verify";
import { BUILTIN_INSTANCES } from "@/config/instances";
import { fetchMachineData } from "@/data/fetch-machine-data";
import { fetchUserBalances } from "@/data/fetch-user-data";
import { toMachineView } from "@/data/machine-view";
import type { MachineData } from "@/data/types";
import { ALL_ERRORS_ABI, decodeRevert } from "@/lib/errors";
import { type ActionKind, preCheckFor } from "@/lib/pre-checks";

import { ETHEREUM, TEST_ACCOUNT } from "./config";
import {
  erc20Balance,
  forkClient,
  forkSkip,
  hubAnchor,
  scanInstance,
  sendAs,
  walletConfig,
  withSnapshot,
} from "./helpers";

const instance = BUILTIN_INSTANCES.find((i) => i.chainId === 1)!;
const NOW = BigInt(Math.floor(Date.now() / 1000));

describe.skipIf(forkSkip)("Action guards (fork)", () => {
  const client = forkClient(1);
  let revertAll: () => Promise<void>;
  let revertEach: () => Promise<void>;
  let dusd: MachineData;
  let peripheryFactory: Address | undefined;

  beforeAll(async () => {
    revertAll = await withSnapshot(client);
    const scan = await scanInstance(client, instance);
    peripheryFactory = scan.peripheryFactory;
    dusd = scan.machineData[ETHEREUM.machines.DUSD.toLowerCase()]!;
    await sendAs(client, ETHEREUM.usdcWhale, {
      address: ETHEREUM.usdc,
      abi: erc20Abi,
      functionName: "transfer",
      args: [TEST_ACCOUNT, parseUnits("1000", 6)],
    });
    await client.setBalance({ address: TEST_ACCOUNT, value: parseEther("1") });
  });
  afterAll(async () => revertAll());
  beforeEach(async () => {
    revertEach = await withSnapshot(client);
  });
  afterEach(async () => revertEach());

  const reload = async () =>
    Object.values(
      await fetchMachineData(client as never, {
        chainId: 1,
        instanceId: instance.id,
        verifiedHub: true,
        machines: [{ machine: dusd.machine, shareToken: dusd.shareToken, factory: dusd.factory, index: 0 }],
        peripheryFactory,
      }),
    )[0]!;

  /** The app's pre-check for `action`, for the connected TEST_ACCOUNT on the right chain (same inputs as the UI). */
  const checkFor = async (data: MachineData, action: ActionKind) => {
    const user = (await fetchUserBalances(client as never, { user: TEST_ACCOUNT, machines: [data] })).byMachine[
      data.machine.toLowerCase()
    ]!;
    return preCheckFor(action, toMachineView(data, undefined, NOW), {
      readOnly: false,
      account: TEST_ACCOUNT,
      walletChainId: 1,
      chainName: "Ethereum",
      user,
      nativeBalance: parseEther("1"),
      hubUnlocked: false,
    });
  };

  const simulateDeposit = async (data: MachineData) => {
    const config = await walletConfig(1, TEST_ACCOUNT);
    const assets = parseUnits("100", 6);
    await sendAs(client, TEST_ACCOUNT, {
      address: ETHEREUM.usdc,
      abi: erc20Abi,
      functionName: "approve",
      args: [data.depositor!, assets],
    });
    const step = depositPlan({
      machine: data,
      hub: hubAnchor(instance),
      account: TEST_ACCOUNT,
      assets,
      shares: 1n,
      slippageBps: 50,
    }).steps[0]!;
    try {
      await simulateContract(config, {
        chainId: 1,
        account: TEST_ACCOUNT,
        address: step.address,
        abi: [...(directDepositorAbi as Abi), ...ALL_ERRORS_ABI],
        functionName: step.functionName,
        args: step.args,
      } as never);
      return undefined;
    } catch (error) {
      return decodeRevert(error);
    }
  };

  it("recovery mode (set by the security council) disables deposit and request, not claim", async () => {
    const council = await client.readContract({
      address: dusd.machine,
      abi: machineAbi,
      functionName: "securityCouncil",
    });
    await sendAs(client, council, {
      address: dusd.machine,
      abi: machineAbi,
      functionName: "setRecoveryMode",
      args: [true],
    });

    const data = await reload();
    expect(data.recoveryMode).toBe(true);
    const view = toMachineView(data, undefined, NOW);
    expect(view.status).toBe("recoveryMode");
    expect(view.access).toBe("Closed");

    expect(await checkFor(data, "deposit")).toMatchObject({ ok: false, code: "recoveryMode" });
    expect(await checkFor(data, "redeem")).toMatchObject({ ok: false, code: "recoveryMode" });
    expect(await checkFor(data, "claim")).toEqual({ ok: true });

    // And the chain agrees: the deposit simulation reverts with RecoveryMode.
    expect((await simulateDeposit(data))?.name).toBe("RecoveryMode");
  });

  it("an enabled whitelist disables deposit with the right reason", async () => {
    const riskManager = await client.readContract({
      address: dusd.machine,
      abi: machineAbi,
      functionName: "riskManager",
    });
    await sendAs(client, riskManager, {
      address: dusd.depositor!,
      abi: directDepositorAbi,
      functionName: "setWhitelistStatus",
      args: [true],
    });

    const data = await reload();
    expect(data.depositorInfo.isWhitelistEnabled).toBe(true);
    expect(toMachineView(data, undefined, NOW).access).toBe("Whitelisted");
    expect(await checkFor(data, "deposit")).toMatchObject({ ok: false, code: "notWhitelisted" });

    expect((await simulateDeposit(data))?.name).toBe("UnauthorizedCaller");
  });

  it("refuses to sign anything when the app's data points at a contract the wallet's RPC does not confirm", async () => {
    // What a malicious public RPC could report: the attacker's address as DUSD's depositor.
    const attacker = "0x00000000000000000000000000000000000bad01" as Address;
    const poisoned = { ...(await reload()), depositor: attacker };
    const config = await walletConfig(1, TEST_ACCOUNT);
    const assets = parseUnits("100", 6);
    const plan = depositPlan({
      machine: poisoned,
      hub: hubAnchor(instance),
      account: TEST_ACCOUNT,
      assets,
      shares: 1n,
      slippageBps: 50,
    });
    const sent: string[] = [];
    await expect(
      executePlan(config, {
        chainId: 1,
        account: TEST_ACCOUNT,
        plan,
        onEvent: (e) => e.type === "sent" && sent.push(e.hash),
      }),
    ).rejects.toThrow(TargetMismatch);
    expect(sent).toEqual([]);
    const allowance = await client.readContract({
      address: ETHEREUM.usdc,
      abi: erc20Abi,
      functionName: "allowance",
      args: [TEST_ACCOUNT, attacker],
    });
    expect(allowance).toBe(0n);
    expect(await erc20Balance(client, ETHEREUM.usdc, TEST_ACCOUNT)).toBe(parseUnits("1000", 6));
  });
});
