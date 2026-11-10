import { type Address, type Hash, isAddressEqual, zeroAddress } from "viem";

/**
 * What a wallet earned on one Machine, in accounting-token units, from its share movements.
 *
 * Every movement of shares into or out of the wallet has a value: a deposit costs its `assets`, a redemption
 * request is worth what it pays (claimed, claimable, or the current estimate), and any other transfer (a swap,
 * Pendle, a liquidation, another wallet) is worth `convertToAssets(shares)` at its block. Then
 *
 *   earned = value held now + value of everything that left − value of everything that came in,
 *
 * so each deposit of a series is costed at its own share price. Average cost splits the total into what the
 * shares still held earned (`current`) and what the shares that left earned (`past`).
 *
 * The movements must account for the wallet's balance and its requests exactly; otherwise there is no figure
 * (`YieldGap`) rather than a wrong one.
 */

/** A share-token `Transfer` from or to the wallet. */
export type ShareTransfer = {
  from: Address;
  to: Address;
  shares: bigint;
  blockNumber: bigint;
  logIndex: number;
  txHash: Hash;
};

/** The wallet's Makina events on one Machine (activity.ts): deposits and requests received, claims made. */
export type YieldEvents = {
  deposits: readonly { txHash: Hash; assets: bigint; shares: bigint }[];
  requests: readonly { txHash: Hash; requestId: bigint; shares: bigint }[];
  claims: readonly { requestId: bigint; assets: bigint }[];
};

export type Movement = ShareTransfer &
  (
    | { kind: "deposit"; assets: bigint }
    | { kind: "request"; requestId: bigint }
    | { kind: "external"; direction: "in" | "out" }
  );

export type YieldGap =
  /** A transfer could not be valued (the RPCs serve no historical state). */
  | "unpriced"
  /** The movements found do not add up to the balance (shares moved in a way the scan cannot see). */
  | "balance"
  /** A redemption request was moved to or from another wallet, or made for or by one. */
  | "request"
  /** A current value could not be read. */
  | "unknownValue";

export type YieldResult =
  | {
      ok: true;
      /** Earned by the shares held now: their value less their average cost. */
      current: bigint;
      /** Earned by the shares that left: what they were worth or paid, less their average cost. */
      past: bigint;
      total: bigint;
      /** Average cost of the shares held now. */
      costBasis: bigint;
    }
  | { ok: false; gap: YieldGap };

export const movementKey = (t: Pick<ShareTransfer, "txHash" | "logIndex">) => `${t.txHash}:${t.logIndex}`;

/**
 * Labels each transfer: a mint matched by a `Deposit` to the wallet in the same transaction, a transfer to the
 * redeemer matched by a request created for the wallet in the same transaction, or external. Transfers to self
 * are dropped (they change nothing). `undefined` when a deposit or request has no matching transfer.
 */
export function classifyTransfers(args: {
  user: Address;
  redeemer: Address | undefined;
  transfers: readonly ShareTransfer[];
  events: YieldEvents;
}): Movement[] | undefined {
  const { user, redeemer, events } = args;
  const deposits = events.deposits.map((d) => ({ ...d, used: false }));
  const requests = events.requests.map((r) => ({ ...r, used: false }));
  const movements: Movement[] = [];

  for (const t of args.transfers) {
    const toUser = isAddressEqual(t.to, user);
    const fromUser = isAddressEqual(t.from, user);
    if (toUser && fromUser) continue;
    if (toUser && isAddressEqual(t.from, zeroAddress)) {
      const d = deposits.find((x) => !x.used && x.txHash === t.txHash && x.shares === t.shares);
      if (d) {
        d.used = true;
        movements.push({ ...t, kind: "deposit", assets: d.assets });
        continue;
      }
    }
    if (fromUser && redeemer && isAddressEqual(t.to, redeemer)) {
      const r = requests.find((x) => !x.used && x.txHash === t.txHash && x.shares === t.shares);
      if (r) {
        r.used = true;
        movements.push({ ...t, kind: "request", requestId: r.requestId });
        continue;
      }
    }
    movements.push({ ...t, kind: "external", direction: toUser ? "in" : "out" });
  }

  if (deposits.some((d) => !d.used) || requests.some((r) => !r.used)) return undefined;
  return movements.sort((a, b) =>
    a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1,
  );
}

/**
 * Earnings on one Machine. `values` holds `convertToAssets(shares)` at the block of each external movement
 * (by `movementKey`); `held` and `heldRequests` are the wallet's current shares and requests, read from state.
 */
export function computeYield(args: {
  movements: readonly Movement[] | undefined;
  claims: YieldEvents["claims"];
  values: ReadonlyMap<string, bigint>;
  held: { shares: bigint | undefined; value: bigint | undefined };
  /** Requests the wallet holds now, with what each pays: the claimable amount or the current estimate. */
  heldRequests: readonly { id: bigint; value: bigint | undefined }[];
}): YieldResult {
  const { movements, values, held } = args;
  if (!movements) return { ok: false, gap: "request" };
  if (held.shares === undefined) return { ok: false, gap: "unknownValue" };

  const claimed = new Map(args.claims.map((c) => [c.requestId, c.assets]));
  const holding = new Map(args.heldRequests.map((r) => [r.id, r.value]));
  const requested = new Set<bigint>();

  let shares = 0n;
  let basis = 0n;
  let past = 0n;
  for (const m of movements) {
    const incoming = m.kind === "deposit" || (m.kind === "external" && m.direction === "in");
    let value: bigint | undefined;
    if (m.kind === "deposit") value = m.assets;
    else if (m.kind === "external") value = values.get(movementKey(m));
    else {
      requested.add(m.requestId);
      if (claimed.has(m.requestId)) value = claimed.get(m.requestId);
      else if (holding.has(m.requestId)) value = holding.get(m.requestId);
      else return { ok: false, gap: "request" };
      if (value === undefined) return { ok: false, gap: "unknownValue" };
    }
    if (value === undefined) return { ok: false, gap: "unpriced" };

    if (incoming) {
      shares += m.shares;
      basis += value;
    } else {
      if (m.shares > shares) return { ok: false, gap: "balance" };
      const cost = m.shares === shares ? basis : (basis * m.shares) / shares;
      shares -= m.shares;
      basis -= cost;
      past += value - cost;
    }
  }

  if (shares !== held.shares) return { ok: false, gap: "balance" };
  if ([...holding.keys()].some((id) => !requested.has(id))) return { ok: false, gap: "request" };
  const heldValue = shares === 0n ? 0n : held.value;
  if (heldValue === undefined) return { ok: false, gap: "unknownValue" };

  // Every conversion rounds down by at most one unit: within that, nothing was earned or lost.
  const dust = BigInt(movements.length) + 1n;
  const settle = (x: bigint) => (x <= dust && x >= -dust ? 0n : x);
  const current = settle(heldValue - basis);
  past = settle(past);
  return { ok: true, current, past, total: current + past, costBasis: basis };
}
