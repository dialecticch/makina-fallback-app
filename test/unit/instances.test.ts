import { describe, expect, it } from "vitest";

import { BUILTIN_INSTANCES, type HubInstance, mergeInstances } from "@/config/instances";

const ETH = BUILTIN_INSTANCES[0]!;

describe("mergeInstances", () => {
  it("dedupes on (chainId, registry) case-insensitively and keeps the first (builtin) entry", () => {
    const discovered: HubInstance = {
      ...ETH,
      id: "discovered-1",
      hubCoreRegistry: ETH.hubCoreRegistry.toLowerCase() as HubInstance["hubCoreRegistry"],
      hubPeripheryRegistry: undefined,
      source: "discovered",
    };
    const merged = mergeInstances(BUILTIN_INSTANCES, [discovered], []);
    expect(merged).toHaveLength(BUILTIN_INSTANCES.length);
    expect(merged.find((i) => i.chainId === 1)?.source).toBe("builtin");
  });

  it("keeps the same registry address on different chains apart", () => {
    const onBase: HubInstance = { ...ETH, id: "user-1", chainId: 8453, source: "user" };
    const merged = mergeInstances(BUILTIN_INSTANCES, [], [onBase]);
    expect(merged).toHaveLength(BUILTIN_INSTANCES.length + 1);
  });

  it("never seeds an instance at block 0", () => {
    for (const instance of BUILTIN_INSTANCES) expect(instance.startBlock).toBeGreaterThan(0n);
  });
});
