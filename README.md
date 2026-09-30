# Makina Fallback App

A minimal, open-source frontend for [Makina](https://makina.finance) Machines that reads everything straight from
the chain. It has no backend, no indexer, no analytics and no API keys: run it on your own machine and you can see
every Machine, check your position, deposit, request a redemption and claim, even if every hosted Makina service is
down.

- **Explore**: every Machine on the Makina hubs (Ethereum and Base built in, others discovered), with TVL, share
  price, fees, cap, access and health (stale accounting, stalled redemption queue).
- **Machine page**: details, the redemption queue, every contract address, and the deposit / redeem / claim actions.
- **Portfolio**: your positions, redemption requests and claimable amounts; activity history on request. Paste any
  address to view it read-only.
- **Actions**: deposit (DirectDepositor), wrap ETH, request a redemption (AsyncRedeemer), claim.

It loads in seconds on free public RPCs: Machines, their data and queue health are read from contract state, not
from event logs ([docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)).

What it is **not**: a replacement for the main Makina app. There are no charts, off-chain APYs, points, referrals or
curator tools.

## Quick start

Prerequisites: [Node.js](https://nodejs.org) `^22.22`, `^24` or `>=26` (`.nvmrc` has the version CI uses) and Git.
pnpm is pinned by hash in `package.json` and runs through Corepack; Node 25 and later no longer bundle Corepack
(`npm install --global corepack@0.36.0` first).

```bash
git clone <repository URL> makina-fallback-app
cd makina-fallback-app
corepack enable
pnpm install --frozen-lockfile
pnpm start
```

`pnpm start` builds the production bundle and serves it at http://localhost:4173. Use it for real transactions: it
has the Content-Security-Policy and security headers, unlike `pnpm dev` (http://localhost:5173, for development,
marked "Development build" in the footer). The two run on different origins, so settings saved in one do not show in
the other (Settings → Backup moves them).

## Where the data comes from

Every read is a JSON-RPC call, through these endpoints in order:

1. RPCs you added (Settings → RPC endpoints, or `VITE_RPC_URLS_<chainId>` at build time);
2. the public RPCs listed in [`src/config/chains.ts`](src/config/chains.ts);
3. your wallet's RPC, only while your wallet is on that network.

The app contacts nothing else. Before any transaction, it re-reads every address the transaction depends on through
your wallet's RPC as well (see [Security](#security)).

**Privacy:** the RPC providers you use see your IP address and the addresses you look up, as with any wallet or
frontend. Settings, public chain data (cached 7 days) and any activity history you loaded are stored in this
browser's localStorage; Settings → Cache clears the data.

**Speed:** a cold load reads Machines in a few requests per hub. Only the activity history scans event logs; on free
public RPCs it takes a minute or two per network the first time, then only new blocks. Your own RPC (a free account at
any provider) makes that near-instant.

## Configuration

Everything is optional.

| Where                                    | What                                                                                    |
| ---------------------------------------- | --------------------------------------------------------------------------------------- |
| Settings → Slippage                      | Tolerance for the minimum shares on deposit and minimum assets on a redemption request. |
| Settings → RPC endpoints                 | Your own RPCs per network, tried first. Each must answer with that network's chain ID.  |
| Settings → Hub networks                  | The hubs the app loads: hide a hub, lock an unlocked one, rescan for new hubs.          |
| Settings → Add a custom hub              | A hub this release does not ship (view-only until you unlock it).                       |
| Settings → Backup                        | Copy, import or reset settings.                                                         |
| `.env.local` → `VITE_RPC_URLS_<chainId>` | RPCs baked into your build. See [`.env.example`](.env.example).                         |

Anything in `VITE_*` ends up in the JavaScript bundle: do not put an RPC URL with a secret key there if you share
your build. Use Settings, or `.env.development.local` (only for `pnpm dev`).

### Hubs

- **Built in** (verified): the Ethereum and Base hubs, pinned in [`src/config/chains.ts`](src/config/chains.ts) and
  checked by maintainer scripts at each release.
- **Discovered**: the app probes every supported network (Arbitrum, Optimism, Ink, Monad) for Makina's
  infrastructure at the known registry addresses.
- **Added by you**: Settings → Add a custom hub, with the chain ID and HubCoreRegistry address (and RPCs for a network
  the app does not ship).

Discovered and added hubs are marked **Unverified hub**: you can view their Machines, but deposits and redemptions
stay disabled until you **unlock** the hub by confirming its registry address against an official Makina source (on any
of its Machine pages). Claims always work, since they cannot send funds anywhere else. Settings → Hub networks locks a
hub again. The app only checks that such an address behaves like a
hub registry, not that Makina deployed it, and "add this RPC / this registry" is an obvious phishing line during an
outage.

## Security

- Run the app from the official repository, at a release you have checked ([Verify a build](#verify-a-build)).
  Anyone can host a modified copy.
- The app never asks for or stores a private key. Transactions are signed in your wallet.
- Before anything is signed, the Machine, its depositor or redeemer, and its tokens are re-read through your wallet's
  RPC and must match what the app shows, starting from the hub's registry. A lying public RPC cannot redirect an
  approval. Each transaction is then simulated through your wallet's RPC.
- Approvals are for exactly the amount of the action, shown with the spender's address before your wallet opens.
  An existing allowance is reset to zero first only when the token requires it.
- The receiver of every deposit, redemption request and claim is the connected account.
- Redemptions go through a queue: requesting one gives you an NFT, and you claim once the Machine's mechanic
  finalizes it. The slippage limit protects the request only: at finalization you receive the lower of the value at
  request time and the value then.
- View-only mode (a pasted address) cannot sign anything.

Report vulnerabilities privately: [SECURITY.md](SECURITY.md).

## Hosting

`dist/` is a static site with relative paths and hash routing: it works on any static host, under a subpath or on
IPFS. `file://` does not work (browsers block module scripts there, and wallets do not inject).

- Give it **its own origin** (a dedicated domain or subdomain, or an IPFS subdomain gateway such as
  `<cid>.ipfs.dweb.link`), never a path on a shared domain (`ipfs.io/ipfs/<cid>/`, `user.github.io/…`): other pages
  on the same origin could read its settings and cached data.
- When serving under a subpath, link to it with a trailing slash (`/app/`, not `/app`).
- Send these headers (the meta CSP cannot carry `frame-ancestors`). The build writes them to `dist/_headers`, which
  Cloudflare Pages and Netlify apply automatically, and `vercel.json` sets them on Vercel:

  ```
  Content-Security-Policy: frame-ancestors 'none'
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  ```

To try a build locally: `pnpm preview`, or `python3 -m http.server -d dist 8080`.

## Verify a build

Each release tag has a build made by the Release workflow from the tagged source alone: `makina-fallback-<tag>.tar.gz`
with its SHA-256, per-file checksums (`dist-files-<tag>.sha256`) and a GitHub build-provenance attestation.

- The footer of every build shows the version and the exact commit (`git describe --dirty`; `-dirty` means
  uncommitted changes).
- To check a hosted copy, compare its files with `dist-files-<tag>.sha256`, or verify a downloaded archive with
  `gh attestation verify makina-fallback-<tag>.tar.gz --repo <owner>/<repo>`.
- To rebuild it yourself: check out the tag, `pnpm install --frozen-lockfile`, `RELEASE=1 pnpm build` (it refuses
  to build with any `VITE_*` variable set), and compare with the checksums.

## Troubleshooting

- **"No answer for N s"**: the network's RPCs are slow or rate-limiting. Add your own RPC in Settings → RPC endpoints
  and reload.
- **"Accounting stale"**: the Machine's share price has not been updated within its threshold. Deposits still work,
  but they are priced from that last update.
- **"Queue stalled"**: the oldest pending redemption is older than the queue's delay plus 72 hours.
- **"The factory has changed since this release"**: Makina upgraded a hub's factory after this release was checked.
  The Machine list may be incomplete: update the app.
- **"Your wallet's RPC does not confirm …"**: the app's RPC and your wallet's disagree about a contract, so nothing
  was sent. Retry, or switch RPCs in Settings.
- **Wrong or outdated numbers**: Refresh on the hub, or Settings → Cache → Clear cache and reload.
- **A button is disabled**: the reason is shown under it (not whitelisted, cap reached, below the minimum, …).

## Customising and forking

- Name, links, defaults (slippage) and local RPC hosts: [`src/config/app.ts`](src/config/app.ts).
- Networks, public RPCs and built-in hubs: [`src/config/chains.ts`](src/config/chains.ts); icons in
  `src/assets/chains/<chainId>.svg`.
- Branding: `public/brand`, `src/components/makina-logo.tsx`, colours in `src/index.css`. Forks not operated by Makina
  must replace the Makina name and logo ([LICENSE](LICENSE)).

How to add a network, an RPC or a hub, update ABIs and cut a release: [CONTRIBUTING.md](CONTRIBUTING.md).

## Development

| Command                  | What it does                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| `pnpm dev`               | Dev server with hot reload.                                                               |
| `pnpm start`             | Production build, served at http://localhost:4173.                                        |
| `pnpm preview`           | Serve the existing `dist/`.                                                               |
| `pnpm lint`              | ESLint and Prettier (`pnpm format` fixes formatting).                                     |
| `pnpm typecheck`         | TypeScript.                                                                               |
| `pnpm test`              | Unit tests (offline, fast).                                                               |
| `pnpm test:fork`         | Fork tests: real transactions against Anvil forks of Ethereum and Base.                   |
| `pnpm update-abis`       | Regenerates `src/abis/` from the pinned contract commits.                                 |
| `pnpm check-factories`   | Checks Machine discovery against the chain and prints the factory pins for built-in hubs. |
| `pnpm find-start-blocks` | Checks the built-in hubs' start blocks.                                                   |
| `pnpm check-implem-ids`  | Checks the periphery implementation IDs the app relies on.                                |
| `pnpm probe-rpcs`        | Measures each public RPC's `eth_getLogs` range limit.                                     |

Fork tests and the `check-*` scripts need [Foundry](https://getfoundry.sh) (version in
[`scripts/abi-sources.json`](scripts/abi-sources.json)) and archive RPCs in `.env.local` as `FORK_RPC_URL_1` and
`FORK_RPC_URL_8453`; without them the fork suite is skipped. Fork tests pin their blocks, fund their own accounts and
liquidity, and run the same transaction code as the UI.

ABIs are generated, never edited: `scripts/abi-sources.json` pins the exact commits of `makina-core` and
`makina-periphery`, `pnpm update-abis` rebuilds them deterministically, and CI fails if the result differs from what
is committed.

## Dependencies

The dependency list is short on purpose (15 runtime packages, about 80 with their own dependencies) and locked down
([`pnpm-workspace.yaml`](pnpm-workspace.yaml)):

- every version is pinned exactly, and the lockfile is installed with `--frozen-lockfile`;
- a new version must be at least 7 days old (`minimumReleaseAge`);
- transitive dependencies cannot come from git or tarball URLs (`blockExoticSubdeps`);
- a version published with weaker provenance than an earlier one is refused (`trustPolicy: no-downgrade`), with one
  documented exception: `semver@6.3.1`, the July 2023 backport of the CVE-2022-25883 fix, published after the
  provenance-signed 7.5.x line. It is dev-only (via `@babel/core`, used by `eslint-plugin-react-hooks`);
- no dependency may run an install script: `allowBuilds` is empty and `strictDepBuilds` fails the install otherwise;
- CI runs `pnpm audit --prod --audit-level high` on every push and weekly, and GitHub Actions are pinned by commit
  SHA.

Runtime dependencies: React and React DOM, React Router, wagmi and viem, TanStack Query (with its persister), Radix UI
primitives (dialog, popover, tabs, tooltip, slot), `tailwind-merge` and `lucide-react` icons.

## License

[MIT](LICENSE), for the code only (not the Makina name or logos). Portions are derived from an MIT-licensed
open-source codebase; the attribution and the list of derived files are in [LICENSE](LICENSE).
