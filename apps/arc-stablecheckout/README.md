# Arc PayOps Console

Arc PayOps Console validates Arc Testnet as a stablecoin treasury operations surface.

The v1 build focuses on:

- Arc Testnet wallet connection
- native USDC gas balance display
- USDC and EURC ERC-20 balance display
- live gas price and latest block reads
- settlement item creation
- ERC-20 USDC/EURC payment submission
- gas estimate capture before submission
- actual fee capture after receipt
- before/after balance deltas
- ERC-20 `Transfer` log reconciliation
- copyable PayOps proof bundle
- explicit Memo, CCTP, Gateway, and StableFX expansion gates

The key product difference from a normal transfer screen is operational accounting: the UI starts from a settlement item and marks it paid only when the Arc receipt contains a matching ERC-20 `Transfer` event for the expected payer, recipient, token, and amount. It also captures gas paid in USDC and balance deltas.

## Development

```sh
npm install
npm --workspace apps/arc-stablecheckout run dev
```

## Build

```sh
npm --workspace apps/arc-stablecheckout run build
```
