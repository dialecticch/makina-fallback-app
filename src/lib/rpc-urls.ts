import { LOCAL_RPC_HOSTS } from "@/config/app";

/**
 * Parses user-entered RPC URLs (one per line or comma-separated). Only `https://` is accepted, plus plain
 * `http://` to a local node (`LOCAL_RPC_HOSTS`), which is all the built app's CSP allows.
 */
export function parseRpcUrls(text: string): { urls: string[]; invalid: string[] } {
  const urls: string[] = [];
  const invalid: string[] = [];
  for (const raw of text.split(/[\s,]+/)) {
    const value = raw.trim();
    if (!value) continue;
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      invalid.push(value);
      continue;
    }
    const local = (LOCAL_RPC_HOSTS as readonly string[]).includes(url.hostname);
    if (url.protocol === "https:" || (url.protocol === "http:" && local)) {
      // Compare normalised forms, so "https://x" and "https://x/" are one URL.
      if (!urls.some((u) => new URL(u).href === url.href)) urls.push(value);
    } else {
      invalid.push(value);
    }
  }
  return { urls, invalid };
}

/** `eth_chainId` of an RPC, or an error message. Used before saving an RPC, so a Base RPC never ends up on Ethereum. */
export async function rpcChainId(url: string): Promise<number> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
    credentials: "omit",
    referrerPolicy: "no-referrer",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = (await response.json()) as { result?: string; error?: { message?: string } };
  if (!body.result) throw new Error(body.error?.message ?? "no chain ID in the reply");
  return Number(BigInt(body.result));
}
