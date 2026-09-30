import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, sanitizeSettings } from "@/config/user-settings";

describe("sanitizeSettings", () => {
  it("falls back to defaults for anything that is not an object", () => {
    for (const junk of [null, 5, "x", [], undefined]) expect(sanitizeSettings(junk)).toEqual(DEFAULT_SETTINGS);
  });

  it("drops invalid RPC lists instead of crashing on them", () => {
    const settings = sanitizeSettings({
      rpcUrls: { "1": 5, "8453": ["https://ok.example", "http://evil.example", 7], x: ["https://a.example"] },
    });
    expect(settings.rpcUrls).toEqual({ "8453": ["https://ok.example"] });
  });

  it("keeps only well-formed instances, with checksummed registries", () => {
    const settings = sanitizeSettings({
      instances: [
        { chainId: 1, hubCoreRegistry: "0x0faeeceab0bcb63be2fe984ea8c77778989d53ea", startBlock: "12", rpcUrls: [] },
        { chainId: 1, hubCoreRegistry: "0xnope", startBlock: "12", rpcUrls: [] },
        { chainId: -1, hubCoreRegistry: "0x0faeeceab0bcb63be2fe984ea8c77778989d53ea", startBlock: "12" },
        { chainId: 1, hubCoreRegistry: "0x0faeeceab0bcb63be2fe984ea8c77778989d53ea", startBlock: "0" },
        {
          chainId: 2,
          hubCoreRegistry: "0x0faeeceab0bcb63be2fe984ea8c77778989d53ea",
          startBlock: "3",
          explorerUrl: "http://x",
        },
      ],
    });
    expect(settings.instances.map((i) => [i.chainId, i.hubCoreRegistry, i.explorerUrl])).toEqual([
      [1, "0x0FAEeCEab0BCb63bE2Fe984Ea8c77778989d53eA", undefined],
      [2, "0x0FAEeCEab0BCb63bE2Fe984Ea8c77778989d53eA", undefined],
    ]);
  });

  it("clamps slippage and theme to known values", () => {
    expect(sanitizeSettings({ slippageBps: 5_000 }).slippageBps).toBe(DEFAULT_SETTINGS.slippageBps);
    expect(sanitizeSettings({ slippageBps: 100 }).slippageBps).toBe(100);
    expect(sanitizeSettings({ theme: "neon" }).theme).toBe("system");
    expect(sanitizeSettings({ unlockedHubs: ["a", 3, "b"] }).unlockedHubs).toEqual(["a", "b"]);
  });
});
