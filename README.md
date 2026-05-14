# Arc PayOps Console

Arc PayOps Console is a public testnet workspace for validating Arc as a USDC-native treasury operations and settlement layer.

The project no longer treats Arc as a clone of a Tempo checkout flow. The current direction is to measure the operational properties that are specific to Arc:

```txt
wallet / treasury -> Arc USDC gas -> settlement -> receipt + Transfer log -> gas and balance proof
```

## Live Demo

GitHub Pages deployment:

```txt
https://a941249849.github.io/arc-stablecheckout-builder/
```

The repository also keeps `vercel.json`, so the same app can be deployed to Vercel after the Vercel account token is refreshed.

## Current Product Scope

Implemented:

- Arc Testnet wallet connection through injected EVM wallets.
- Arc Testnet network switch configuration.
- Native USDC gas balance read with 18-decimal accounting.
- USDC and EURC ERC-20 balance reads with 6-decimal accounting.
- Live gas price and latest block reads from Arc RPC.
- Settlement item creation with recipient, amount, token, and reference.
- ERC-20 transfer submission for Arc Testnet USDC/EURC.
- Pre-submit gas estimate and estimated USDC fee capture.
- RPC receipt wait and verification.
- Actual gas used, effective gas price, and fee paid in USDC.
- Before/after native USDC and token balance deltas.
- ERC-20 `Transfer` log reconciliation.
- Copyable PayOps proof bundle.
- Manual transaction-hash verification against a selected settlement item.

Gated expansion modules:

- App Kit Send comparison.
- CCTP / Bridge Kit consolidation into Arc.
- Gateway unified balance.
- StableFX settlement.
- Memo contract invoice metadata.

These are not presented as completed features until live proof exists.

## Why This Angle

Arc's strongest current builder angle is not a generic transfer page. It is a stablecoin operations layer:

- USDC is the native gas asset.
- Fees are dollar-denominated and operationally measurable.
- USDC has both native gas representation and ERC-20 transfer interface.
- Arc is designed to work with Circle App Kit, CCTP, Gateway, EURC, and StableFX.
- The useful developer question is whether Arc can reduce treasury fragmentation and improve settlement observability.

## App

```sh
npm install
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
- [Arc PayOps deployment plan](docs/arc-payops-deployment-plan.md)
- [Tempo vs Arc comparison outline](docs/tempo-vs-arc-comparison-outline.md)

## Boundaries

- Testnet only.
- No token, ICO, or airdrop claims.
- No production funds.
- No Circle Console credential assumptions in public frontend code.
- No final Arc vs Tempo conclusion until both sides have comparable transaction evidence.
