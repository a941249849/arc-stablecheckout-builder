# Arc StableCheckout

Arc StableCheckout is a testnet checkout demo for validating stablecoin invoice payments on Arc Testnet.

The v1 demo focuses on:

- Arc Testnet wallet connection
- USDC and EURC balance display
- local invoice creation
- ERC-20 USDC/EURC payment submission
- RPC receipt verification
- ERC-20 `Transfer` log reconciliation
- payment proof bundle
- explicit Memo contract status

The key product difference from a normal transfer screen is reconciliation: the UI starts from an invoice and marks it paid only when the Arc receipt contains a matching ERC-20 `Transfer` event for the expected payer, recipient, token, and amount.

## Development

```sh
npm install
npm --workspace apps/arc-stablecheckout run dev
```

## Build

```sh
npm --workspace apps/arc-stablecheckout run build
```
