import { describe, expect, it } from "vitest";

import { BUILTIN_INSTANCES } from "@/config/instances";
import { classifyRegistry } from "@/data/discovery";

import { BASE } from "./config";
import { forkClient, forkSkip, scanInstance } from "./helpers";

const ethereumHub = BUILTIN_INSTANCES.find((i) => i.chainId === 1)!;
const baseHub = BUILTIN_INSTANCES.find((i) => i.chainId === 8453)!;

describe.skipIf(forkSkip)("Base hub (fork)", () => {
  it("lists the Base hub Machines", async () => {
    const { machineData } = await scanInstance(forkClient(8453), baseHub);
    expect(Object.keys(machineData).length).toBeGreaterThanOrEqual(Object.keys(BASE.machines).length);
    for (const [symbol, address] of Object.entries(BASE.machines)) {
      const data = machineData[address.toLowerCase()];
      expect(data, `${symbol} listed`).toBeDefined();
      expect(data!.share.symbol).toBe(symbol);
      expect(data!.sharePrice).toBeGreaterThan(0n);
    }
  });

  it("classifies registries: hub where it is one, spoke where the same address is a SpokeCoreRegistry", async () => {
    const base = forkClient(8453);
    const ethereum = forkClient(1);
    expect((await classifyRegistry(base, baseHub.hubCoreRegistry)).kind).toBe("hub");
    // The Ethereum instance's registry address is a SpokeCoreRegistry on Base.
    expect((await classifyRegistry(base, ethereumHub.hubCoreRegistry)).kind).toBe("spoke");
    expect((await classifyRegistry(ethereum, ethereumHub.hubCoreRegistry)).kind).toBe("hub");
    expect((await classifyRegistry(ethereum, baseHub.hubCoreRegistry)).kind).toBe("spoke");
  });
});
