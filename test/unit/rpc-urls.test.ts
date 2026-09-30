import { describe, expect, it } from "vitest";

import { allChainConfigs, allUserRpcUrls } from "@/config/user-chains";
import { parseRpcUrls } from "@/lib/rpc-urls";

describe("parseRpcUrls", () => {
  it("accepts https and local http, one per line or comma-separated", () => {
    expect(parseRpcUrls("https://a.example/rpc\nhttps://b.example, http://127.0.0.1:8545")).toEqual({
      urls: ["https://a.example/rpc", "https://b.example", "http://127.0.0.1:8545"],
      invalid: [],
    });
  });

  it("drops duplicates that differ only in normalisation", () => {
    expect(parseRpcUrls("https://a.example https://a.example/").urls).toEqual(["https://a.example"]);
  });

  it("rejects remote plain http, other schemes and junk", () => {
    expect(parseRpcUrls("http://node.example ftp://x wss://y.example notaurl").invalid).toEqual([
      "http://node.example",
      "ftp://x",
      "wss://y.example",
      "notaurl",
    ]);
  });
});

describe("user chains", () => {
  const instance = {
    chainId: 999_999,
    name: "Test chain",
    rpcUrls: ["https://rpc.test.example"],
    hubCoreRegistry: "0x1111111111111111111111111111111111111111" as const,
    startBlock: "42",
  };

  it("defines unknown chains from user-added instances, once", () => {
    const configs = allChainConfigs({
      instances: [instance, { ...instance, hubCoreRegistry: "0x2222222222222222222222222222222222222222" }],
    });
    const custom = configs.filter((c) => c.chain.id === 999_999);
    expect(custom).toHaveLength(1);
    expect(custom[0]!.chain.name).toBe("Test chain");
    expect(custom[0]!.chain.rpcUrls.default.http).toEqual(["https://rpc.test.example"]);
  });

  it("never lets an instance bring RPCs to a shipped chain (they would serve the built-in hub too)", () => {
    const onBase = { ...instance, chainId: 8453 };
    expect(allChainConfigs({ instances: [onBase] }).filter((c) => c.chain.id === 8453)).toHaveLength(1);
    expect(allUserRpcUrls({ rpcUrls: { "8453": ["https://mine.example"] }, instances: [onBase] })["8453"]).toEqual([
      "https://mine.example",
    ]);
  });

  it("uses the instance RPCs for a chain the app does not ship", () => {
    expect(allUserRpcUrls({ rpcUrls: {}, instances: [instance] })["999999"]).toEqual(["https://rpc.test.example"]);
  });
});
