import type { Abi, Address, ContractFunctionArgs, ContractFunctionName, PublicClient } from "viem";

/** Names of an ABI's read-only functions. */
export type ViewName<abi extends Abi> = ContractFunctionName<abi, "pure" | "view">;

/** One `eth_call` inside a multicall. Build it with `call()` so the function name is checked against the ABI. */
export type Call = { address: Address; abi: Abi; functionName: string; args?: readonly unknown[] };

/**
 * A read, type-checked against its ABI: after an ABI update, a renamed or removed function (or wrong arguments)
 * fails to compile instead of silently reading `undefined`.
 */
export function call<const abi extends Abi, const fn extends ViewName<abi>>(
  address: Address,
  abi: abi,
  functionName: fn,
  args?: ContractFunctionArgs<abi, "pure" | "view", fn>,
): Call {
  return { address, abi: abi as Abi, functionName, args: args as readonly unknown[] | undefined };
}

/** Multicall with `allowFailure`: each failed read comes back as `undefined` instead of failing the batch. */
export async function multicallLoose(client: Pick<PublicClient, "multicall">, calls: Call[]): Promise<unknown[]> {
  if (calls.length === 0) return [];
  // Heterogeneous calls defeat viem's per-call typing (checked at construction by `call()` instead).
  const results = (await client.multicall({
    contracts: calls as unknown as readonly { address: Address; abi: Abi; functionName: string }[],
    allowFailure: true,
    batchSize: 16_384,
  })) as { status: "success" | "failure"; result?: unknown }[];
  return results.map((r) => (r.status === "success" ? r.result : undefined));
}

type Slot<T> = (target: T, value: unknown) => void;

/**
 * Collects reads for a list of targets, then runs them in two multicalls and writes each result into its target.
 * External contracts (accounting tokens, sanctions oracles) go in the second one: a sub-call that burns all its gas
 * (an invalid opcode, a broken token) starves every later call in the same multicall, so a misbehaving external
 * contract can only blank its own fields.
 */
export function readBatch<T>() {
  const makina = { calls: [] as Call[], slots: [] as [number, Slot<T>][] };
  const external = { calls: [] as Call[], slots: [] as [number, Slot<T>][] };
  return {
    add(index: number, read: Call, slot: Slot<T>, kind: "makina" | "external" = "makina") {
      const batch = kind === "makina" ? makina : external;
      batch.calls.push(read);
      batch.slots.push([index, slot]);
    },
    async run(client: Pick<PublicClient, "multicall">, targets: readonly T[]) {
      const [a, b] = await Promise.all([
        multicallLoose(client, makina.calls),
        multicallLoose(client, external.calls).catch(() => external.calls.map(() => undefined)),
      ]);
      makina.slots.forEach(([i, slot], k) => slot(targets[i]!, a[k]));
      external.slots.forEach(([i, slot], k) => slot(targets[i]!, b[k]));
    },
  };
}

export const asAddress = (v: unknown) => v as Address | undefined;
export const asBigint = (v: unknown) => v as bigint | undefined;
export const asBool = (v: unknown) => v as boolean | undefined;
export const asNumber = (v: unknown) => (v === undefined ? undefined : Number(v));
export const asString = (v: unknown) => (typeof v === "string" ? v : undefined);
