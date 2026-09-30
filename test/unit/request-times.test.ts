import { describe, expect, it } from "vitest";

import { readRequestTimes, requestTimeSlot } from "@/data/request-times";

describe("request times from AsyncRedeemer storage", () => {
  it("computes the slot of requests[id].requestTime in the ERC-7201 namespace", () => {
    // keccak256(abi.encode(5, NAMESPACE + 3)) + 2. On 2026-09-30 this slot on Ethereum's DMW redeemer held the
    // exact timestamp of the block with RedeemRequestCreated(5), as did every other pending request on both hubs.
    expect(requestTimeSlot(5n)).toBe("0x4a81fc11ec0a97789236abc15f53ac8ed29dbe15c2c69875f987b827ff77c902");
    expect(requestTimeSlot(6n)).not.toBe(requestTimeSlot(5n));
  });

  it("returns undefined for burned requests and implausible values", async () => {
    const values: Record<string, `0x${string}`> = {
      [requestTimeSlot(1n)]: `0x${1_789_000_000n.toString(16).padStart(64, "0")}`,
      [requestTimeSlot(2n)]: `0x${"0".repeat(64)}`,
      [requestTimeSlot(3n)]: `0x${9_999_999_999n.toString(16).padStart(64, "0")}`,
    };
    const client = { getStorageAt: async ({ slot }: { slot: `0x${string}` }) => values[slot] };
    const times = await readRequestTimes(
      client as never,
      "0x1111111111111111111111111111111111111111",
      [1n, 2n, 3n, 4n],
      1_790_000_000n,
    );
    expect(times).toEqual([1_789_000_000n, undefined, undefined, undefined]);
  });
});
