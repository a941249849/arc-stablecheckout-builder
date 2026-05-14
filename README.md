# Arc StableCheckout Builder

Arc StableCheckout Builder is a separate research and implementation workspace for testing payment flows on Arc Testnet.

This repository starts from the Arc phase after the Tempo StablePay demo. Its purpose is to determine whether Arc can produce a verifiable stablecoin checkout flow with the same evidence standard:

```txt
invoice -> USDC payment -> RPC receipt / Arcscan -> event or transaction proof -> paid
```

## Current Status

The first phase is research and build gating. No Arc demo code has been added yet.

Current findings:

- Arc public testnet is available.
- Arc Testnet chain ID is `5042002`.
- RPC `https://rpc.testnet.arc.network` is reachable.
- USDC is the native gas token.
- The USDC ERC-20 interface is `0x3600000000000000000000000000000000000000`.
- App Kit supports Arc Testnet for Send, Bridge, Swap, and Unified Balance.
- A predeployed Memo contract may provide an invoice-reference path, but it must be validated before being presented as a working feature.

## Documents

- [Arc current state review](docs/arc-current-state.md)
- [Arc build gate](docs/arc-build-gate.md)
- [Tempo vs Arc comparison outline](docs/tempo-vs-arc-comparison-outline.md)

## Planned Demo

Working name: `Arc StableCheckout`.

Minimum target:

1. Connect a wallet to Arc Testnet.
2. Fund with testnet USDC.
3. Create a local invoice.
4. Send USDC.
5. Verify the RPC receipt.
6. Check Arcscan visibility.
7. Determine whether the Memo contract can support invoice reconciliation.

## Boundaries

- Testnet only.
- No token, ICO, or airdrop claims.
- No production funds.
- No Circle Console credential assumptions in public frontend code.
- No comparison claims until Arc has transaction evidence.
