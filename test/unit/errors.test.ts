import { ContractFunctionRevertedError, encodeErrorResult, type Hex, UserRejectedRequestError } from "viem";
import { describe, expect, it } from "vitest";

import { directDepositorAbi } from "@/abis";
import { ALL_ERRORS_ABI, decodeRevert } from "@/lib/errors";

function reverted(data: Hex) {
  // Simulating the depositor: the Machine's ExceededMaxMint is not in the depositor's own ABI.
  return new ContractFunctionRevertedError({ abi: directDepositorAbi, data, functionName: "deposit" });
}

describe("decodeRevert", () => {
  it("decodes errors raised deeper in the call (Machine errors through the depositor)", () => {
    const data = encodeErrorResult({ abi: ALL_ERRORS_ABI, errorName: "ExceededMaxMint", args: [10n, 5n] });
    const decoded = decodeRevert(reverted(data));
    expect(decoded.name).toBe("ExceededMaxMint");
    expect(decoded.message).toMatch(/share cap/);
  });

  it("maps the plan's errors to plain messages", () => {
    for (const errorName of [
      "SlippageProtection",
      "AmountTooLow",
      "NotFinalized",
      "UnauthorizedCaller",
      "SanctionedCaller",
      "RecoveryMode",
    ]) {
      const data = encodeErrorResult({ abi: ALL_ERRORS_ABI, errorName } as never);
      const decoded = decodeRevert(reverted(data));
      expect(decoded.name).toBe(errorName);
      expect(decoded.message).not.toMatch(/reverted with/);
    }
  });

  it("decodes OpenZeppelin ERC721IncorrectOwner", () => {
    const data = encodeErrorResult({
      abi: ALL_ERRORS_ABI,
      errorName: "ERC721IncorrectOwner",
      args: ["0x1111111111111111111111111111111111111111", 3n, "0x2222222222222222222222222222222222222222"],
    } as never);
    expect(decodeRevert(reverted(data)).message).toMatch(/owner/);
  });

  it("shows the selector for unknown errors", () => {
    const decoded = decodeRevert(reverted("0xdeadbeef"));
    expect(decoded.selector).toBe("0xdeadbeef");
    expect(decoded.message).toMatch(/0xdeadbeef/);
  });

  it("recognises wallet rejections", () => {
    const decoded = decodeRevert(new UserRejectedRequestError(new Error("User rejected")));
    expect(decoded.rejected).toBe(true);
  });
});
