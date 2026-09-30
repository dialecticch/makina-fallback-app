import {
  type Abi,
  BaseError,
  ContractFunctionRevertedError,
  decodeErrorResult,
  type Hex,
  UserRejectedRequestError,
} from "viem";

import * as abis from "@/abis";

/**
 * Every custom error in every vendored ABI, deduplicated by name, so a revert from any depth decodes. Built from
 * the generated ABIs: a new ABI in scripts/abi-sources.json is picked up without editing this file.
 */
export const ALL_ERRORS_ABI = Object.values(abis)
  .flatMap((abi) => (abi as Abi).filter((item) => item.type === "error"))
  .filter(
    (item, i, all) => all.findIndex((o) => o.type === "error" && item.type === "error" && o.name === item.name) === i,
  ) as Abi;

const MESSAGES: Record<string, string> = {
  ExceededMaxMint: "This deposit would exceed the Machine's share cap. Try a smaller amount.",
  ExceededMaxWithdraw: "The Machine does not hold enough liquid assets for this right now.",
  SlippageProtection: "The price moved beyond your slippage tolerance. Refresh and try again, or raise slippage.",
  AmountTooLow: "The amount is below the minimum redemption.",
  NotFinalized: "This request has not been finalized yet.",
  AlreadyFinalized: "This request is already finalized.",
  FinalizationDelayPending: "The finalization delay has not passed yet.",
  UnauthorizedCaller: "This address is not allowed to use this contract (it may not be whitelisted).",
  SanctionedCaller: "This address cannot use this Machine.",
  RecoveryMode: "The Machine is in recovery mode: deposits and new redemption requests are disabled.",
  ERC721IncorrectOwner: "Only the current owner of this redemption NFT can claim it.",
  ERC721NonexistentToken: "This redemption request no longer exists (it may already be claimed).",
  ERC20InsufficientBalance: "Your balance is too low for this amount.",
  ERC20InsufficientAllowance: "The token approval is lower than this amount. Approve again.",
  SafeERC20FailedOperation: "A token transfer failed. Check your balance and approval.",
  MachineNotSet: "This contract is not attached to a Machine.",
};

export type DecodedRevert = { name?: string; selector?: Hex; message: string; rejected?: boolean };

/** Turns anything thrown by a simulation, a wallet or a receipt into one plain-language line. */
export function decodeRevert(error: unknown): DecodedRevert {
  if (!(error instanceof BaseError)) {
    return { message: error instanceof Error ? error.message : String(error) };
  }

  if (error.walk((e) => e instanceof UserRejectedRequestError)) {
    return { message: "The request was rejected in your wallet.", rejected: true };
  }

  const reverted = error.walk((e) => e instanceof ContractFunctionRevertedError) as
    ContractFunctionRevertedError | undefined;
  if (reverted) {
    let name = reverted.data?.errorName;
    const raw = reverted.raw;
    if (!name && raw && raw.length >= 10) {
      try {
        name = decodeErrorResult({ abi: ALL_ERRORS_ABI, data: raw }).errorName;
      } catch {
        // Unknown error: fall through to the selector.
      }
    }
    const selector = raw && raw.length >= 10 ? (raw.slice(0, 10) as Hex) : undefined;
    if (name && name !== "Error" && name !== "Panic") {
      return {
        name,
        selector,
        message: MESSAGES[name] ?? `The contract reverted with ${name}${selector ? ` (${selector})` : ""}.`,
      };
    }
    if (reverted.reason) return { name, selector, message: `The contract reverted: ${reverted.reason}` };
    if (selector) return { selector, message: `The contract reverted with an unknown error (${selector}).` };
    return { message: "The contract reverted without a reason." };
  }

  return { message: error.shortMessage || error.message };
}

/** True when a contract call reverted (as opposed to a network, RPC or rate-limit error). */
export function isContractRevert(error: unknown): boolean {
  return error instanceof BaseError && error.walk((e) => e instanceof ContractFunctionRevertedError) !== null;
}
