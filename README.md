# Arc StableCheckout Builder

Arc StableCheckout Builder is a public testnet workspace for validating whether Arc can support a practical stablecoin checkout loop with verifiable payment evidence.

The repository is independent from the Tempo demo. It uses Arc as the primary build target and keeps the Tempo comparison in separate research notes so the engineering surface stays clean.

## Live Demo

GitHub Pages deployment:

```txt
https://a941249849.github.io/arc-stablecheckout-builder/
```

The repository also keeps a `vercel.json` configuration, so the same app can be deployed to Vercel after the Vercel account token is refreshed.

The demo flow is:

```txt
invoice -> USDC / EURC payment -> Arc RPC receipt -> ERC-20 Transfer log match -> copyable proof bundle
```

This is intentionally more than a generic transfer page. The app only marks an invoice as paid after it can match the transaction receipt against the expected payer, recipient, token, and amount.

## Current Status

Implemented:

- Arc Testnet wallet connection through injected EVM wallets.
- Arc Testnet network switch configuration.
- USDC and EURC balance reads.
- Local invoice creation with recipient, amount, token, and reference.
- ERC-20 transfer submission for Arc Testnet stablecoins.
- RPC receipt wait and verification.
- ERC-20 `Transfer` log reconciliation.
- Copyable proof bundle with tx hash, block data, sender, recipient, token contract, and reconciliation status.
- Manual transaction-hash verification against the selected invoice.
- Explicit Memo contract status as pending validation, not a completed claim.

Known boundary:

- v1 uses standard ERC-20 transfer reconciliation. The predeployed Arc Memo contract remains a validation item until a live memo-attached payment path is proven.

## App

```sh
npm install
npm --workspace apps/arc-stablecheckout run dev
npm --workspace apps/arc-stablecheckout run build
```

Workspace path:

```txt
apps/arc-stablecheckout
```

## Network

| Item | Value |
| --- | --- |
| Network | Arc Testnet |
| Chain ID | `5042002` |
| RPC | `https://rpc.testnet.arc.network` |
| Explorer | `https://testnet.arcscan.app` |
| Faucet | `https://faucet.circle.com` |
| USDC interface | `0x3600000000000000000000000000000000000000` |
| EURC | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` |
| Memo contract under evaluation | `0x9702466268ccF55eAB64cdf484d272Ac08d3b75b` |

## Research Notes

- [Arc current state review](docs/arc-current-state.md)
- [Arc build gate](docs/arc-build-gate.md)
- [Tempo vs Arc comparison outline](docs/tempo-vs-arc-comparison-outline.md)

## Boundaries

- Testnet only.
- No token, ICO, or airdrop claims.
- No production funds.
- No Circle Console credential assumptions in public frontend code.
- No final Arc vs Tempo conclusion until both sides have comparable transaction evidence.
