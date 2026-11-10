import { type Address, encodeAbiParameters, hexToBigInt, keccak256, numberToHex, type PublicClient } from "viem";

/**
 * Creation time and recorded assets of redemption requests, read from AsyncRedeemer storage: the contract exposes
 * no getter for either, and reading storage is two orders of magnitude cheaper than finding the
 * `RedeemRequestCreated` log.
 *
 * Layout (makina-periphery v1.3.0, AsyncRedeemer and AsyncRedeemerFee): ERC-7201 namespace
 * `makina.storage.AsyncRedeemer` holds `{ _nextRequestId, _lastFinalizedRequestId, _finalizationDelay,
 * mapping(uint256 => RedeemRequest) _requests, _minRedeemAmount }`, and `RedeemRequest` is
 * `{ shares, assets, requestTime }`. Only use this for redeemers whose implementation ID says they have this
 * layout (2001, 2002).
 */
const NAMESPACE = 0x187c268ec5d498b5b6e4945b27f62abf37217cdbd80e6429181b3e4c2c378900n;
const REQUESTS_SLOT = NAMESPACE + 3n;
const REQUEST_ASSETS_OFFSET = 1n;
const REQUEST_TIME_OFFSET = 2n;

function requestSlot(requestId: bigint, offset: bigint) {
  const base = hexToBigInt(
    keccak256(encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [requestId, REQUESTS_SLOT])),
  );
  return numberToHex(base + offset, { size: 32 });
}

export const requestTimeSlot = (requestId: bigint) => requestSlot(requestId, REQUEST_TIME_OFFSET);
export const requestAssetsSlot = (requestId: bigint) => requestSlot(requestId, REQUEST_ASSETS_OFFSET);

/**
 * `assets` recorded when each request was created (`convertToAssets(shares)` less any redeem fee, at that time),
 * `undefined` where the read failed. Finalization pays the lower of this and the value then.
 */
export async function readRequestAssets(
  client: Pick<PublicClient, "getStorageAt">,
  redeemer: Address,
  requestIds: readonly bigint[],
): Promise<(bigint | undefined)[]> {
  return Promise.all(
    requestIds.map(async (id) => {
      const value = await client
        .getStorageAt({ address: redeemer, slot: requestAssetsSlot(id) })
        .catch(() => undefined);
      return value ? hexToBigInt(value) : undefined;
    }),
  );
}

/**
 * `requestTime` (unix seconds) for each request, `undefined` where the read failed or the value is not a
 * plausible timestamp (a burned request reads as 0).
 */
export async function readRequestTimes(
  client: Pick<PublicClient, "getStorageAt">,
  redeemer: Address,
  requestIds: readonly bigint[],
  nowSeconds = BigInt(Math.floor(Date.now() / 1000)),
): Promise<(bigint | undefined)[]> {
  return Promise.all(
    requestIds.map(async (id) => {
      const value = await client.getStorageAt({ address: redeemer, slot: requestTimeSlot(id) }).catch(() => undefined);
      if (!value) return undefined;
      const time = hexToBigInt(value);
      // After 2020 and not in the future (with a little clock skew).
      return time > 1_577_836_800n && time <= nowSeconds + 600n ? time : undefined;
    }),
  );
}
