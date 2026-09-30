import { type Address, getAddress, isAddress } from "viem";

/**
 * Parses a pasted address for view-only mode. Accepts all-lowercase or correctly checksummed input (a mixed-case
 * address with a bad checksum is rejected, since it is likely a typo). No ENS: that would need a mainnet lookup.
 */
export function parseViewAddress(input: string | null | undefined): Address | undefined {
  const value = input?.trim();
  if (!value || !isAddress(value)) return undefined;
  return getAddress(value);
}
