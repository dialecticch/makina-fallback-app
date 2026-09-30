import {
  type Address,
  erc20Abi,
  getAddress,
  parseEther,
  parseEventLogs,
  parseUnits,
  type TransactionReceipt,
} from "viem";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asyncRedeemerAbi, machineAbi } from "@/abis";
import { type ExecuteEvent, executePlan } from "@/actions/execute";
import { claimPlan, depositPlan, requestRedeemPlan, wrapPlan } from "@/actions/plans";
import { BUILTIN_INSTANCES } from "@/config/instances";
import { scanActivity } from "@/data/activity";
import { fetchMachineData } from "@/data/fetch-machine-data";
import { fetchUserBalances, fetchUserRequests } from "@/data/fetch-user-data";
import { toMachineView } from "@/data/machine-view";
import type { MachineData } from "@/data/types";

import { ETHEREUM, FORK, TEST_ACCOUNT } from "./config";
import {
  erc20Balance,
  forkClient,
  forkSkip,
  forkUrl,
  hubAnchor,
  scanInstance,
  sendAs,
  walletConfig,
  withSnapshot,
} from "./helpers";

const instance = BUILTIN_INSTANCES.find((i) => i.chainId === 1)!;
const NOW = BigInt(Math.floor(Date.now() / 1000));

describe.skipIf(forkSkip)("Ethereum hub (fork)", () => {
  const client = forkClient(1);
  let revert: () => Promise<void>;
  let machineData: Record<string, MachineData>;
  let peripheryFactory: Address | undefined;
  const hub = hubAnchor(instance);

  beforeAll(async () => {
    revert = await withSnapshot(client);
    ({ machineData, peripheryFactory } = await scanInstance(client, instance));
  });
  afterAll(async () => revert());

  /** Fresh Machine data for one Machine, read the way the scanner reads it. */
  const dataFor = async (machine: Address) => {
    const known = machineData[machine.toLowerCase()]!;
    return Object.values(
      await fetchMachineData(client as never, {
        chainId: 1,
        instanceId: instance.id,
        verifiedHub: true,
        machines: [{ machine, shareToken: known.shareToken, factory: known.factory, index: 0 }],
        peripheryFactory,
      }),
    )[0]!;
  };

  it("finds exactly the 13 Machines from the factory nonces", () => {
    expect(Object.keys(machineData)).toHaveLength(13);
  });

  it("lists every Machine on the strategies page with a share price, and TVL where funded", () => {
    const listed = new Set(Object.keys(machineData));
    for (const [symbol, address] of Object.entries(ETHEREUM.machines)) {
      expect(listed.has(address.toLowerCase()), `${symbol} listed`).toBe(true);
      const data = machineData[address.toLowerCase()]!;
      expect(data.share.symbol).toBe(symbol);
      expect(data.sharePrice, `${symbol} share price`).toBeGreaterThan(0n);
    }
    for (const symbol of ETHEREUM.funded) {
      expect(machineData[ETHEREUM.machines[symbol].toLowerCase()]!.lastTotalAum, `${symbol} TVL`).toBeGreaterThan(0n);
    }
    const dusd = toMachineView(machineData[ETHEREUM.machines.DUSD.toLowerCase()]!, undefined, NOW);
    expect(dusd.depositorKind).toBe("DirectDepositor");
    expect(dusd.redeemerKind).toBe("AsyncRedeemer");
    expect(dusd.feeManagerKind).toBe("WatermarkFeeManager");
  });

  it("deposits into Dialectic USD, then requests, finalizes (self-funded) and claims", async () => {
    const assets = parseUnits("10000", 6);

    // The whale funds a fresh account; the test first checks the whale really holds enough at the fork block.
    expect(await erc20Balance(client, ETHEREUM.usdc, ETHEREUM.usdcWhale)).toBeGreaterThan(assets * 100n);
    await sendAs(client, ETHEREUM.usdcWhale, {
      address: ETHEREUM.usdc,
      abi: erc20Abi,
      functionName: "transfer",
      args: [TEST_ACCOUNT, assets],
    });
    await client.setBalance({ address: TEST_ACCOUNT, value: parseEther("1") });
    const config = await walletConfig(1, TEST_ACCOUNT);

    // MARK: Deposit (simulated, exact approval, slippage)
    const dusd = await dataFor(ETHEREUM.machines.DUSD);
    const shares = await client.readContract({
      address: dusd.machine,
      abi: machineAbi,
      functionName: "convertToShares",
      args: [assets],
    });
    const receipts: TransactionReceipt[] = [];
    const onEvent = (e: ExecuteEvent) => e.type === "confirmed" && receipts.push(e.receipt);
    await executePlan(config, {
      chainId: 1,
      account: TEST_ACCOUNT,
      plan: depositPlan({ machine: dusd, hub, account: TEST_ACCOUNT, assets, shares, slippageBps: 50 }),
      onEvent,
    });
    expect(receipts).toHaveLength(2); // approve + deposit
    const approval = parseEventLogs({ abi: erc20Abi, eventName: "Approval", logs: receipts[0]!.logs })[0]!;
    expect(approval.args.value).toBe(assets); // exact-amount approval
    expect(getAddress(approval.args.spender)).toBe(getAddress(dusd.depositor!));
    const deposit = parseEventLogs({ abi: machineAbi, eventName: "Deposit", logs: receipts[1]!.logs })[0]!;
    expect(getAddress(deposit.args.receiver)).toBe(getAddress(TEST_ACCOUNT));
    expect(deposit.args.shares).toBeGreaterThanOrEqual((shares * 9_950n) / 10_000n);

    // MARK: The app sees the balance and the activity
    const balances = await fetchUserBalances(client as never, { user: TEST_ACCOUNT, machines: [dusd] });
    const position = balances.byMachine[dusd.machine.toLowerCase()]!;
    expect(position.shares).toBe(deposit.args.shares);
    expect(position.value).toBeGreaterThan((assets * 99n) / 100n);
    expect(position.depositAllowance).toBe(0n); // the depositor pulled exactly what was approved

    // MARK: Request a redemption
    const redeemShares = position.shares!;
    const gross = await client.readContract({
      address: dusd.machine,
      abi: machineAbi,
      functionName: "convertToAssets",
      args: [redeemShares],
    });
    receipts.length = 0;
    await executePlan(config, {
      chainId: 1,
      account: TEST_ACCOUNT,
      plan: requestRedeemPlan({
        machine: dusd,
        hub,
        account: TEST_ACCOUNT,
        shares: redeemShares,
        grossAssets: gross,
        redeemFeeRate: undefined,
        slippageBps: 50,
      }),
      onEvent,
    });
    const created = parseEventLogs({
      abi: asyncRedeemerAbi,
      eventName: "RedeemRequestCreated",
      logs: receipts.at(-1)!.logs,
    })[0]!;
    const requestId = created.args.requestId;

    // Activity comes from the app's log scanner and its one address-less filter (topics[2] = user).
    const activity = await scanActivity({
      client: client as never,
      endpoints: [{ url: forkUrl(1), maxBlocks: 1_000 }],
      chainId: 1,
      user: TEST_ACCOUNT,
      fromBlock: FORK[1].block,
      confirmations: 0n,
      machines: [dusd],
    });
    expect(activity.map((a) => a.kind)).toEqual(["request", "deposit"]);
    expect(activity[0]!.requestId).toBe(requestId);

    // The request, found from state (NFT balance, then ownerOf), with its creation time from storage.
    const findRequests = async (machine: MachineData) => {
      const { byMachine } = await fetchUserBalances(client as never, { user: TEST_ACCOUNT, machines: [machine] });
      return fetchUserRequests(client as never, { chainId: 1, user: TEST_ACCOUNT, machines: [machine], byMachine });
    };
    const requestBlock = await client.getBlock({ blockNumber: receipts.at(-1)!.blockNumber });
    let [request] = await findRequests(await dataFor(dusd.machine));
    expect(request!.id).toBe(requestId);
    expect(request!.claimable).toBe(false);
    expect(request!.estimatedAssets).toBe(gross);
    expect(request!.requestTime).toBe(requestBlock.timestamp);

    // MARK: Finalize: the test funds the liquidity itself
    const delay = await client.readContract({
      address: dusd.redeemer!,
      abi: asyncRedeemerAbi,
      functionName: "finalizationDelay",
    });
    await client.increaseTime({ seconds: Number(delay) + 1 });
    await client.mine({ blocks: 1 });
    const [, totalAssets] = await client.readContract({
      address: dusd.redeemer!,
      abi: asyncRedeemerAbi,
      functionName: "previewFinalizeRequests",
      args: [requestId],
    });
    await sendAs(client, ETHEREUM.usdcWhale, {
      address: ETHEREUM.usdc,
      abi: erc20Abi,
      functionName: "transfer",
      args: [dusd.machine, (totalAssets * 101n) / 100n],
    });
    const mechanic = await client.readContract({ address: dusd.machine, abi: machineAbi, functionName: "mechanic" });
    await sendAs(client, mechanic, {
      address: dusd.redeemer!,
      abi: asyncRedeemerAbi,
      functionName: "finalizeRequests",
      args: [requestId, 0n],
    });

    // MARK: Claim
    const finalized = await dataFor(dusd.machine);
    expect(finalized.redeemerInfo.lastFinalizedRequestId).toBeGreaterThanOrEqual(requestId);
    [request] = await findRequests(finalized);
    expect(request!.claimable).toBe(true);
    const claimable = request!.claimableAssets!;
    expect(claimable).toBeLessThanOrEqual(gross); // payout can only be equal or lower than the estimate

    const before = await erc20Balance(client, ETHEREUM.usdc, TEST_ACCOUNT);
    await executePlan(config, {
      chainId: 1,
      account: TEST_ACCOUNT,
      plan: claimPlan([{ machine: finalized, hub, requestId }]),
    });
    const after = await erc20Balance(client, ETHEREUM.usdc, TEST_ACCOUNT);
    expect(after - before).toBe(claimable);
  });

  it("wraps ETH and deposits it into Dialectic ETH", async () => {
    const account = "0x00000000000000000000000000000000000e7401" as Address;
    await client.setBalance({ address: account, value: parseEther("5") });
    const config = await walletConfig(1, account);

    const amount = parseEther("1");
    await executePlan(config, { chainId: 1, account, plan: wrapPlan(ETHEREUM.weth, amount) });
    expect(await erc20Balance(client, ETHEREUM.weth, account)).toBe(amount);

    const deth = await dataFor(ETHEREUM.machines.DETH);
    expect(getAddress(deth.accountingToken!)).toBe(getAddress(ETHEREUM.weth));
    const shares = await client.readContract({
      address: deth.machine,
      abi: machineAbi,
      functionName: "convertToShares",
      args: [amount],
    });
    await executePlan(config, {
      chainId: 1,
      account,
      plan: depositPlan({ machine: deth, hub, account, assets: amount, shares, slippageBps: 50 }),
    });
    const balances = await fetchUserBalances(client as never, { user: account, machines: [deth] });
    expect(balances.byMachine[deth.machine.toLowerCase()]!.shares).toBeGreaterThanOrEqual((shares * 9_950n) / 10_000n);
    expect(await erc20Balance(client, ETHEREUM.weth, account)).toBe(0n);
  });
});
