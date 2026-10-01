# Changelog

All notable changes to this app. Versions follow [semver](https://semver.org); each release tag has a verifiable
build (README, Verify a build).

## Unreleased

First public version.

- Explore every Machine on the Ethereum and Base hubs, plus hubs discovered on Arbitrum, Optimism, Ink and Monad
  (read-only until unlocked).
- Machine page with fees, limits, redemption queue health and every contract address.
- Portfolio for a connected wallet or any pasted address (view-only): positions, redemption requests, claimable
  amounts, and on-demand activity history.
- Deposit, wrap ETH, request a redemption and claim, with exact approvals as their own step and pre-signing checks
  through the wallet's own RPC.
- Machine discovery and queue health from contract state: a cold load takes seconds on free public RPCs.
