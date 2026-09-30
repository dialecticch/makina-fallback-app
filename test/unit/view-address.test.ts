import { describe, expect, it } from "vitest";

import { parseViewAddress } from "@/lib/view-address";

describe("parseViewAddress", () => {
  it("accepts lowercase and checksummed addresses and returns the checksummed form", () => {
    expect(parseViewAddress("0x6b006870c83b1cd49e766ac9209f8d68763df721")).toBe(
      "0x6b006870C83b1Cd49E766Ac9209f8d68763Df721",
    );
    expect(parseViewAddress("  0x6b006870C83b1Cd49E766Ac9209f8d68763Df721 ")).toBe(
      "0x6b006870C83b1Cd49E766Ac9209f8d68763Df721",
    );
  });

  it("rejects a bad checksum, ENS names and junk", () => {
    expect(parseViewAddress("0x6B006870C83b1Cd49E766Ac9209f8d68763Df721")).toBeUndefined();
    expect(parseViewAddress("vitalik.eth")).toBeUndefined();
    expect(parseViewAddress("0x1234")).toBeUndefined();
    expect(parseViewAddress("")).toBeUndefined();
    expect(parseViewAddress(null)).toBeUndefined();
  });
});
