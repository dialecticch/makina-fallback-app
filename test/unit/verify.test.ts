import { type Address, BaseError, ContractFunctionRevertedError, erc20Abi } from "viem";
import { describe, expect, it, vi } from "vitest";

import { approvalSteps } from "@/actions/execute";
import { needsApproval } from "@/actions/use-approval-step";
import { type PlanTargets, TargetMismatch, verifyTargets } from "@/actions/verify";

const A = (n: number) => `0x${n.toString(16).padStart(40, "0")}` as Address;
const REGISTRY = A(1);
const FACTORY = A(2);
const MACHINE = A(3);
const SHARE = A(4);
const DEPOSITOR = A(5);
const TOKEN = A(6);
const REDEEMER = A(7);
const PERIPHERY_REGISTRY = A(8);
const PERIPHERY_FACTORY = A(9);
const ATTACKER = A(0xbad);

/** What the wallet's RPC answers, keyed by `address.functionName`. */
type Chain = Record<string, unknown>;
const honest: Chain = {
  [`${REGISTRY}.coreFactory`]: FACTORY,
  [`${FACTORY}.isMachine`]: true,
  [`${MACHINE}.shareToken`]: SHARE,
  [`${SHARE}.minter`]: MACHINE,
  [`${MACHINE}.depositor`]: DEPOSITOR,
  [`${MACHINE}.redeemer`]: REDEEMER,
  [`${MACHINE}.accountingToken`]: TOKEN,
  [`${DEPOSITOR}.machine`]: MACHINE,
  [`${REDEEMER}.machine`]: MACHINE,
  [`${PERIPHERY_REGISTRY}.peripheryFactory`]: PERIPHERY_FACTORY,
  [`${PERIPHERY_FACTORY}.isDepositor`]: true,
  [`${PERIPHERY_FACTORY}.isRedeemer`]: true,
};

function reader(chain: Chain) {
  return {
    multicall: vi.fn(async ({ contracts }: { contracts: { address: Address; functionName: string }[] }) =>
      contracts.map((c) => {
        const value = chain[`${c.address}.${c.functionName}`];
        return value === undefined ? { status: "failure" } : { status: "success", result: value };
      }),
    ),
  };
}

const deposit: PlanTargets = {
  kind: "deposit",
  machine: MACHINE,
  factory: FACTORY,
  hubCoreRegistry: REGISTRY,
  hubPeripheryRegistry: PERIPHERY_REGISTRY,
  trustedFactories: [FACTORY],
  shareToken: SHARE,
  depositor: DEPOSITOR,
  accountingToken: TOKEN,
  redeemer: REDEEMER,
};

describe("verifyTargets (the wallet's RPC must confirm every address a transaction uses)", () => {
  it("passes when the wallet's RPC agrees", async () => {
    await expect(verifyTargets(reader(honest) as never, deposit)).resolves.toBeUndefined();
    await expect(verifyTargets(reader(honest) as never, { ...deposit, kind: "redeem" })).resolves.toBeUndefined();
  });

  it("refuses a depositor the app's RPC made up (approval to an attacker)", async () => {
    await expect(verifyTargets(reader(honest) as never, { ...deposit, depositor: ATTACKER })).rejects.toThrow(
      TargetMismatch,
    );
  });

  it("refuses a fake Machine reusing a real share token", async () => {
    const chain = { ...honest, [`${FACTORY}.isMachine`]: false };
    await expect(verifyTargets(reader(chain) as never, { ...deposit, kind: "redeem" })).rejects.toThrow(/is a Machine/);
    const stolenShare = { ...honest, [`${SHARE}.minter`]: A(0x999) };
    await expect(verifyTargets(reader(stolenShare) as never, { ...deposit, kind: "redeem" })).rejects.toThrow(
      /share token belongs/,
    );
  });

  it("refuses a factory that is neither pinned nor the registry's", async () => {
    await expect(
      verifyTargets(reader(honest) as never, { ...deposit, factory: ATTACKER, trustedFactories: [] }),
    ).rejects.toThrow(/factory/);
  });

  it("refuses a depositor Makina's periphery factory did not create", async () => {
    const chain = { ...honest, [`${PERIPHERY_FACTORY}.isDepositor`]: false };
    await expect(verifyTargets(reader(chain) as never, deposit)).rejects.toThrow(/periphery factory/);
  });

  it("treats an unanswered read as a mismatch", async () => {
    const { [`${DEPOSITOR}.machine`]: _dropped, ...chain } = honest;
    await expect(verifyTargets(reader(chain) as never, deposit)).rejects.toThrow(/depositor belongs/);
  });
});

describe("approvalSteps", () => {
  const need = { token: TOKEN, spender: DEPOSITOR, amount: 100n, symbol: "USDC" };
  const account = A(0xa11ce);
  const revert = () => {
    const inner = new ContractFunctionRevertedError({ abi: erc20Abi, functionName: "approve" });
    return new BaseError("reverted", { cause: inner });
  };

  it("adds nothing when the allowance already covers the amount", async () => {
    const r = { readContract: vi.fn(async () => 100n), simulateContract: vi.fn() };
    expect(await approvalSteps(r as never, { account, need })).toEqual([]);
  });

  it("approves exactly the amount", async () => {
    const r = { readContract: vi.fn(async () => 0n), simulateContract: vi.fn() };
    const steps = await approvalSteps(r as never, { account, need });
    expect(steps.map((s) => [s.functionName, s.args])).toEqual([["approve", [DEPOSITOR, 100n]]]);
  });

  it("resets to zero first only when approving directly reverts (USDT-style tokens)", async () => {
    const r = { readContract: vi.fn(async () => 5n), simulateContract: vi.fn(async () => Promise.reject(revert())) };
    const steps = await approvalSteps(r as never, { account, need });
    expect(steps.map((s) => s.args)).toEqual([
      [DEPOSITOR, 0n],
      [DEPOSITOR, 100n],
    ]);
  });

  it("does not add a reset on a network error", async () => {
    const r = {
      readContract: vi.fn(async () => 5n),
      simulateContract: vi.fn(async () => Promise.reject(new Error("HTTP 429"))),
    };
    await expect(approvalSteps(r as never, { account, need })).rejects.toThrow("HTTP 429");
  });
});

describe("needsApproval (what the form announces)", () => {
  it("is unknown until both the allowance and the amount are", () => {
    expect(needsApproval(undefined, 100n)).toBeUndefined();
    expect(needsApproval(0n, undefined)).toBeUndefined();
    expect(needsApproval(0n, 0n)).toBeUndefined();
  });

  it("is needed only when the allowance is below the amount", () => {
    expect(needsApproval(99n, 100n)).toBe(true);
    expect(needsApproval(100n, 100n)).toBe(false);
    expect(needsApproval(500n, 100n)).toBe(false);
  });
});
