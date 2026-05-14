# Arc Build Gate

Last updated: 2026-05-14

This document defines the implementation gate for the Arc phase. It is intentionally conservative: build only after the base payment path can produce verifiable testnet evidence.

## Source Set

- Official site: https://www.arc.network/
- Official docs: https://docs.arc.network/
- Public testnet announcement: https://investor.circle.com/news/news-details/2025/Circle-Launches-Arc-Public-Testnet/default.aspx
- Arc node repository: https://github.com/circlefin/arc-node
- App Kit Send docs: https://docs.arc.network/app-kit/send
- Send quickstart: https://docs.arc.network/app-kit/quickstarts/send-tokens-same-chain
- Contract addresses: https://docs.arc.network/arc/references/contract-addresses
- Gas and fees: https://docs.arc.network/arc/references/gas-and-fees

## Current Network Target

Use Arc Testnet for v1.

| Item | Value |
| --- | --- |
| Network | Arc Testnet |
| Chain ID | `5042002` |
| Currency | `USDC` |
| HTTP RPC | `https://rpc.testnet.arc.network` |
| WebSocket RPC | `wss://rpc.testnet.arc.network` |
| Explorer | `https://testnet.arcscan.app` |
| Faucet | `https://faucet.circle.com` |

Live check on 2026-05-14:

- `eth_chainId` returned `0x4cef52` / `5042002`.
- `eth_blockNumber` returned `0x282ea47` / `42134087`.
- `eth_gasPrice` returned `0x4a8270a40` / about `20.001 Gwei`.

## Token Set

Use official Arc Testnet stablecoin contracts.

| Token | Symbol | Address | Decimals | v1 Role |
| --- | --- | --- | --- | --- |
| USDC | `USDC` | `0x3600000000000000000000000000000000000000` | 6 for ERC-20 interface, 18 for native gas accounting | default payment and gas token |
| EURC | `EURC` | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` | 6 | secondary payment token check |

Important precision rule:

- Use the ERC-20 interface for application balances and transfers.
- Treat native gas accounting separately because Arc gas uses USDC with 18-decimal precision.

## v1 Product Scope

Build `Arc StableCheckout`, not another generic transfer UI.

Minimum flow:

1. Create invoice with recipient, amount, token, and reference.
2. Connect wallet to Arc Testnet.
3. Confirm testnet USDC balance.
4. Send USDC payment.
5. Capture transaction hash.
6. Verify RPC receipt.
7. Link Arcscan transaction.
8. Mark invoice paid only from verified receipt and transfer evidence.

Memo evaluation flow:

1. Inspect the predeployed Memo contract at `0x9702466268ccF55eAB64cdf484d272Ac08d3b75b`.
2. Determine whether it can attach invoice metadata to a USDC payment without requiring a custom contract.
3. If feasible, send payment through Memo and decode the emitted `Memo` event.
4. If not feasible, document the limitation and use standard ERC-20 `Transfer` reconciliation for v1.

## Implementation Stack

Recommended v1 stack:

- Vite
- React
- TypeScript
- Wagmi
- Viem
- Optional: `@circle-fin/app-kit`
- Optional: `@circle-fin/adapter-viem-v2`

Implementation decision:

- Use Viem/Wagmi for the first browser-wallet transaction path because it keeps the demo close to the current Tempo app structure.
- Use App Kit only if it materially simplifies Send, Bridge, or Unified Balance after the basic wallet path works.

## Build Readiness Checks

Do these before implementing the UI:

1. Add Arc Testnet to the test wallet.
2. Fund wallet with testnet USDC from the Circle faucet.
3. Send a small native USDC transaction or ERC-20 USDC transfer.
4. Confirm the receipt through RPC.
5. Confirm Arcscan displays the transaction in browser.
6. Read `Transfer` logs from the USDC interface.
7. Evaluate the Memo contract call surface.

Do not proceed to a public demo until checks 3-6 are complete.

## Defer

- CCTP bridge flows.
- Gateway unified balance.
- StableFX.
- Circle Contracts event monitors.
- Circle developer-controlled wallets.
- Account abstraction.
- Production backend ledger.
- Token, ICO, or airdrop claims.

Reason:

These are real Arc differentiators, but they add credential, product, and operational assumptions. The immediate goal is implementation evidence for a payment demo that can be compared against Tempo.

## Evidence Required For Completion

The Arc phase is not complete until it has:

- Demo URL.
- GitHub source.
- Successful transaction hash.
- RPC receipt proof.
- Arcscan proof or documented explorer limitation.
- Token balance before/after.
- Wallet behavior notes.
- Clear statement on whether Memo-based invoice reconciliation worked.
- Short article outline connecting Arc back to the Tempo demo.
