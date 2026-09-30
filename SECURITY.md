# Security

## Reporting a vulnerability

Please do not open a public issue. Report it privately through GitHub's
[private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
on this repository ("Security" tab, "Report a vulnerability"). Include the affected version (the commit shown in
the app's footer), steps to reproduce and the impact. We aim to answer within three working days.

Issues in Makina's smart contracts belong to Makina's own programme, not this repository.

## What this app does to keep funds safe

- It never asks for, sees or stores a private key. Every transaction is signed in the user's wallet.
- Before anything is signed, every address a transaction depends on (Machine, depositor or redeemer, share and
  accounting tokens, factory) is re-read through the wallet's own RPC and must match what the app showed. A lying
  public RPC cannot redirect an approval.
- Approvals are for the exact amount of each action. Transactions are simulated through the wallet's RPC first.
- Hubs not built into the release (discovered on other networks, or added by hand) are read-only until the user
  confirms their registry address.
- The receiver of every deposit, redemption and claim is the connected account.
- The production build ships a Content-Security-Policy, refuses to run inside a frame and disables CCIP-Read.
- Dependencies are pinned exactly, installed from a frozen lockfile, with install scripts disabled and a 7-day
  release-age delay (README, Dependencies). Contract ABIs are generated from pinned commits.

## Known limits

- Reads (balances, prices, queue state) come from public RPCs, which can be wrong or censored. Only transaction
  targets are cross-checked with the wallet; displayed numbers are not. Use your own RPC for the most reliable view.
- Settings, including any RPC URL with an API key in it, are stored in the browser's localStorage for the page's
  origin. Host the app on its own origin (README, Hosting).
- Anyone can host a modified copy. Check the commit in the footer against a release (README, Verify a build).
