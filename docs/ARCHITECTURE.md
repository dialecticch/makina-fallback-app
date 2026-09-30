# Architecture

The app is a static bundle that talks to nothing but JSON-RPC endpoints and the user's wallet. This page explains
how it finds and reads Machines, how transactions are protected, and the rules the code follows. For setup and
maintenance tasks, see [CONTRIBUTING.md](../CONTRIBUTING.md).

## Principles

1. **Chain state first, logs last.** Everything the app shows or acts on is read from contract state with
   multicalls, which cost the same on a free public RPC as on a paid one. Event logs are only used for the
   optional activity history, loaded on request.
2. **Trust nothing a single RPC says before signing.** Public RPCs are shared and can be wrong or malicious, so every
   address a transaction depends on is confirmed through the wallet's own provider first
   ([Transactions](#transactions)).
3. **Built-in means verified.** Hubs shipped in `src/config/chains.ts` are pinned and checked by maintainer scripts.
   Hubs found at runtime or added by the user are shown, but stay read-only until the user unlocks them.
4. **Failures stay local.** Each hub loads independently; each page section has its own error boundary; a failed
   read blanks one field, not the page. Any change of chain, Machine, account or wallet network remounts the action
   forms, abandoning any flow in progress.
5. **Supply chain locked down.** Exact versions, a frozen lockfile, no install scripts, a 7-day release-age delay, and
   ABIs generated from pinned contract commits (never edited by hand). See README, Dependencies.

## Data flow

```
src/config/chains.ts ─┐                          ┌─> hub-store ──┐
(built-in hubs)       ├─> useInstances ─> InstanceScanner ─┘               ├─> pages (Explore, Machine, Portfolio)
use-discovery.ts ─────┤                  (one per hub)          ┌─> user-store ─┘
user settings ────────┘                      UserScanner ────────┘
                                             (one per hub, for the viewer)
```

Scanners are components that render nothing: each runs TanStack queries for one hub (or one hub and one viewer) and
publishes a snapshot to a small store (`src/lib/snapshot-store.ts`); pages read the stores. This keeps every
chain's loading, errors and retries independent.

### A hub, from its registry (`src/data/instance-scanner.tsx`)

1. **Heads:** `registry.coreFactory()`, the factory's EIP-1967 implementation, and (built-in hubs)
   `peripheryRegistry.peripheryFactory()`.
2. **Factories** (`resolveFactories` in `src/data/machines.ts`): for a built-in hub whose current factory is pinned,
   the pinned list. Otherwise the registry's history is bisected with historical `coreFactory()` reads (about 20
   reads per change); without an archive RPC only the current factory is used and a warning is shown.
3. **Machines** (`enumerateMachines`): HubCoreFactory deploys every Machine with a plain `CREATE`
   (`new BeaconProxy(...)`), so each Machine's address is `getContractAddress(factory, nonce)` for one of the
   factory's past nonces. One `eth_getTransactionCount` and one multicall of `factory.isMachine(candidate)` (plus
   `candidate.shareToken()`) find every Machine in about half a second, however old the chain. `pnpm check-factories`
   proves this against the full `MachineCreated` history for built-in hubs and prints the pins; the app warns when a
   built-in factory's implementation no longer matches its pin.
4. **Machine data** (`src/data/fetch-machine-data.ts`): two rounds of multicalls. Round 1 reads the Machine and its
   share token; round 2 reads what those point at (accounting token, depositor, redeemer, fee manager, implementation
   IDs from the periphery factory, share price). External tokens go in a separate multicall so a broken token can
   only blank its own fields.
5. **Queue health** (`src/data/request-times.ts`): for each redeemer with pending requests, the oldest one's creation
   time, read from AsyncRedeemer storage (`requests[id].requestTime` in the ERC-7201 namespace; there is no getter).
   Only used for the redeemer implementations whose layout was checked (IDs 2001 and 2002).

### A viewer (`src/data/user-scanner.tsx`, `src/data/fetch-user-data.ts`)

One round of multicalls per hub: share and accounting-token balances, both allowances, whitelist and sanctions reads,
and the number of redemption request NFTs. Then, only where the viewer holds NFTs, one `ownerOf` multicall over the
request IDs (claimed requests are burned, so every existing ID is unclaimed) finds their requests; shares, the
claimable amount or an estimate, and the creation time from storage complete them. A pasted address takes exactly the
same path as a connected wallet; only the action buttons differ.

### Activity history (`src/data/activity.ts`, `src/lib/log-scanner.ts`)

The only log scan, run when the user asks. One filter per chain and user, with no contract address: the three
Makina-specific event signatures in `topics[0]` and the user in `topics[2]`. Logs are kept only when emitted by a
known Machine or redeemer, and the filter never changes when Machines are added, so the cache stays valid.

The scanner (`scanLogs`) runs outside React. Every RPC works through one queue of block ranges in parallel, each with
its own range limit (`maxLogBlocks` in chains.ts, or 10,000 blocks doubling and halving for unknown RPCs). Requests
are paced per RPC (`src/lib/rate-limit.ts`: the rate halves on a 429 and grows slowly on success), aborted on timeout,
and a rate limit never shrinks the range. The result is cached in localStorage up to a block old enough not to be
reorged, so later visits only fetch new blocks.

## Transactions

`executePlan` (`src/actions/execute.ts`) runs every action the same way, for the UI and the fork tests:

1. **Verify targets** (`src/actions/verify.ts`), through the wallet's own provider: the factory is pinned (or the
   registry's), `factory.isMachine(machine)`, the Machine's depositor or redeemer, share token and accounting token
   match what the app showed, `shareToken.minter() == machine`, the depositor or redeemer points back at the Machine,
   and Makina's periphery factory created it. Any mismatch stops the flow before anything is signed.
2. **Approvals:** exactly the amount, only when the live allowance is lower; a reset to 0 first only when approving
   directly reverts (USDT-style tokens).
3. **Each step:** simulated from the account through the wallet's provider, sent with the chain ID (a wallet on
   another network is refused before signing), then awaited. A slow receipt keeps the flow pending (never "failed"),
   a speed-up is followed, a cancellation in the wallet stops it.

The receiver is always the connected account. Slippage: `minShares` and `minAssets` are the estimate less the user's
tolerance, rounded down. `minAssets` only protects the redemption request itself: at finalization the redeemer pays
the lower of the recorded and the then-current value.

## Settings and persistence

- **Settings** (`src/config/user-settings.ts`): RPCs, slippage, added hubs, unlocked and hidden hubs, theme. In
  localStorage for this origin; every read is sanitised, so corrupt storage falls back to defaults.
- **Query cache** (`src/lib/query-client.ts`): public chain data (Machines, their data, queue health) persisted for
  7 days, so reloads render immediately while revalidating. Nothing about the viewer's address is persisted there.
  Bump `CACHE_BUSTER` in `src/config/constants.ts` whenever the shape of a persisted query changes.
- **Activity cache:** one localStorage entry per chain and address that loaded activity. "Clear cache" removes both.

## Security headers

The production build carries a Content-Security-Policy meta tag (`vite.config.ts`): scripts from the bundle only, no
inline scripts, `connect-src https:` (users can add their own RPCs) plus local http nodes, no objects, forms or base
URI changes. `frame-ancestors` cannot be set in a meta tag, so hosts must send it as a header (README, Hosting), and
`main.tsx` refuses to run inside a frame. CCIP-Read is disabled so no contract can make the browser fetch arbitrary
URLs.
