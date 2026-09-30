# Contributing

Thanks for helping keep the fallback app working. Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) first: it
explains how the app reads the chain and protects transactions. Keep changes small and the dependency list short.

## Setup

- Node.js `^22.22`, `^24` or `>=26` (`.nvmrc` has the version CI uses). pnpm 11 runs through Corepack
  (`corepack enable`), pinned by hash in `package.json`.
- `pnpm install --frozen-lockfile`, then `pnpm dev`.
- Before a pull request: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, and `pnpm test:fork` if you
  touched anything under `src/actions`, `src/data` or `src/config` (needs archive RPCs, see below).
- Windows: use WSL for the shell scripts; `.gitattributes` keeps line endings LF so `pnpm lint` passes.

## Common tasks

### Add a public RPC

1. Add it to the chain's `rpcs` in `src/config/chains.ts`, with `batch` only if it accepts JSON-RPC batches.
2. `pnpm probe-rpcs <chainId>` prints the largest historical `eth_getLogs` range each RPC of that chain accepts; set
   `maxLogBlocks` from it (0 if it refuses historical logs, unset if unconstrained).

### Add a chain

1. One entry in `CANDIDATE_CHAINS` (`src/config/chains.ts`): the viem chain, RPCs, `blockTimeSeconds`, and `wrap`
   if the native token is ETH.
2. Its icon as `src/assets/chains/<chainId>.svg`.
3. `VITE_RPC_URLS_<chainId>` in `src/config/user-settings.ts` and `src/vite-env.d.ts` (build-time RPC override).

Discovery then probes the chain for Makina hubs on its own; any hub found there is shown read-only.

### Add a built-in hub

1. Add `hub` to the chain's entry in `src/config/chains.ts` with the registry and periphery registry addresses from
   an official Makina source, `startBlock: 1n`, and empty `knownFactories` / `factoryImplementations`.
2. `pnpm find-start-blocks` (needs an archive RPC in `FORK_RPC_URL_<chainId>` in `.env.local`) and copy the start
   block.
3. `pnpm check-factories` and copy the printed `knownFactories` and `factoryImplementations`. It fails unless the
   Machines found from the factory nonces equal the ones in the `MachineCreated` history.
4. `pnpm check-implem-ids`: every depositor, redeemer and fee manager must use an implementation ID in `IMPLEM_IDS`
   (`src/config/constants.ts`), or those Machines are read-only.
5. Optionally a fork test: a block in `test/fork/config.ts`, the chain in `test/fork/helpers.ts`, and the secret in
   `.github/workflows/ci.yaml`.

### A factory upgrade

If the app warns that a built-in factory changed, run `pnpm check-factories`. If it passes, update the pins it prints.
If Machines are missing, the new factory no longer deploys them with `CREATE`: `src/data/machines.ts` needs a new
discovery path before the pins are updated.

### A new periphery implementation ID

If the contract's ABI and behaviour match a known kind, add the ID to `IMPLEM_IDS` in `src/config/constants.ts` and
run `pnpm check-implem-ids`. For a new redeemer, also check that its storage layout matches `src/data/request-times.ts`
before relying on it. A new kind needs its ABI (below), its reads in `src/data/fetch-machine-data.ts` and its plan in
`src/actions/plans.ts`.

### Update contract ABIs

1. Bump the commit (and tag) in `scripts/abi-sources.json`; add contracts there if needed.
2. `pnpm update-abis` (needs Foundry at the version in that file, and `jq`). Output is deterministic; CI fails if the
   committed ABIs differ.
3. Review `git diff src/abis`. Contract calls are type-checked against the ABIs (`call()` in `src/lib/calls.ts`,
   `tx()` in `src/actions/plans.ts`), so `pnpm typecheck` catches renamed or removed functions. Error decoding picks up
   new custom errors automatically; add a plain-language message in `src/lib/errors.ts` for the ones users will meet.
4. Bump the fork blocks in `test/fork/config.ts` if the upgrade is newer, and run `pnpm test:fork`.
5. Bump `CACHE_BUSTER` in `src/config/constants.ts` if any persisted data changes shape.

## Dependencies

Every new dependency needs a reason: the whole point of this app is to be easy to audit. The rules
(`pnpm-workspace.yaml`):

- Exact versions only (`savePrefix: ""`), installed with `--frozen-lockfile`.
- A version must be 7 days old (`minimumReleaseAge`). For an urgent security fix, add that exact version to
  `minimumReleaseAgeExclude` with a comment and the advisory link, and remove it once it is old enough.
- No install scripts: `allowBuilds` is empty. An entry needs a README (Dependencies) note explaining why.
- `trustPolicy: no-downgrade` refuses versions with weaker provenance than an earlier one. An exception goes in
  `trustPolicyExclude` as an exact version, with the reason in a comment and in the README.
- After bumping, recompute `engines.node` in `package.json`: it must be the intersection of every locked package's
  `engines` (with `engineStrict`, a wrong range breaks installs for users).

## Releases

1. Update `version` in `package.json` and move the "Unreleased" notes in `CHANGELOG.md` under the new version.
2. Tag `vX.Y.Z` on `main` and push the tag. The Release workflow builds from the tag alone (it refuses to build if any
   `VITE_*` variable is set), and publishes `dist` as a tarball with its SHA-256, per-file checksums and a
   build-provenance attestation.
3. The footer of the published build shows the tag and full commit; README, Verify a build, explains the check.
