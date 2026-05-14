# Arc PayOps Deployment Plan

Last updated: 2026-05-14

## Positioning

Arc should be tested as a stablecoin operations layer, not as another checkout clone.

The deployment angle is:

```txt
USDC treasury balance -> Arc settlement -> USDC gas accounting -> receipt proof -> reconciliation record
```

This maps better to Arc's actual design than a simple invoice transfer page because Arc's differentiators are USDC as gas, stable fee design, Circle stack integration, CCTP/Gateway liquidity movement, EURC/StableFX settlement, and enterprise-grade observability.

## Market Context

Stablecoin payment chains are converging around different claims:

- Tempo: payment network adjacency, merchant and agentic commerce, memo-native transfer semantics.
- Plasma: USDT payment rail and stablecoin settlement narrative.
- Arc: Circle-native USDC financial infrastructure, USDC gas, CCTP/Gateway, EURC, StableFX, and institutional settlement.

Arc currently has additional market attention because Circle is exploring a native Arc token and a longer-term proof-of-stake direction. That is useful for timing, but the product should not depend on a token claim.

## v1 Deployed Scope

The public demo must prove the base PayOps loop:

1. Connect a wallet to Arc Testnet.
2. Read native USDC gas balance.
3. Read USDC and EURC ERC-20 balances.
4. Read current Arc gas price and latest block.
5. Create a settlement item.
6. Estimate gas and estimated fee in USDC before submission.
7. Submit USDC or EURC transfer.
8. Wait for RPC receipt.
9. Capture actual gas used, effective gas price, and fee paid in USDC.
10. Capture before/after native and token balances.
11. Match the expected ERC-20 `Transfer` event.
12. Produce a copyable proof bundle.

Completion standard:

- The frontend builds without type errors.
- The public deployment loads over HTTPS.
- The page explains why the demo is a PayOps console rather than a generic transfer UI.
- Proof output includes gas and balance evidence, not only tx hash.

## v2 Engineering Modules

### App Kit Send Comparison

Goal:

- Compare raw Wagmi/Viem transfer against Circle App Kit Send.

Evidence needed:

- App Kit send result.
- Returned transaction hash and explorer URL.
- Gas estimate or fee data if exposed.
- UX difference compared with direct wallet transfer.

Gate:

- Do not present App Kit as integrated until a live send is proven.

### CCTP / Bridge Kit Consolidation

Goal:

- Demonstrate USDC moving from another testnet into Arc, then show Arc as the settlement treasury.

Evidence needed:

- Source-chain burn or transfer tx.
- Attestation status.
- Arc mint or receive tx.
- Final Arc balance delta.

Gate:

- Requires Circle Console credentials or an approved public test path.

### Gateway Unified Balance

Goal:

- Test the Arc thesis that liquidity can be consolidated and accessed through a unified USDC balance.

Evidence needed:

- Arc deposit approval.
- Gateway deposit tx.
- Unified balance read.
- Spend or payout proof if available.

Gate:

- Requires Circle stack setup and should not be simulated in the public frontend.

### StableFX / EURC Settlement

Goal:

- Test whether Arc can support an FX-style payment workflow instead of only dollar payments.

Evidence needed:

- USDC/EURC quote or escrow call path.
- Settlement tx.
- Post-settlement balances.

Gate:

- Requires confirmed StableFX contract call surface and test liquidity.

### Memo Contract Evaluation

Goal:

- Determine whether Arc's Memo contract can attach useful invoice metadata to settlement calls.

Evidence needed:

- Successful call routed through Memo.
- Decoded `Memo` event.
- Preserved sender behavior verified against Transfer event.

Gate:

- Do not frame Arc as memo-equivalent to Tempo unless this is proven.

## Article Structure

Working thesis:

```txt
Arc is not interesting because it can send USDC. It is interesting if it can become the operational layer for stablecoin treasury, settlement, gas accounting, and crosschain liquidity.
```

Recommended outline:

1. Why a cloned checkout demo is the wrong Arc angle.
2. What Arc adds: USDC gas, stable fees, Circle stack, CCTP/Gateway, EURC/StableFX.
3. What the deployed PayOps Console verifies today.
4. What remains gated: App Kit, CCTP, Gateway, StableFX, Memo.
5. How this differs from Tempo and Plasma.
6. What evidence is still needed before making a stronger Arc conclusion.

## Sources

- Arc homepage: https://www.arc.network/
- Arc docs overview: https://docs.arc.network/arc-chain
- Gas and fees: https://docs.arc.network/arc/references/gas-and-fees
- Contract addresses: https://docs.arc.network/arc/references/contract-addresses
- App Kit Send: https://docs.arc.network/app-kit/send
- App Kit SDK reference: https://docs.arc.network/app-kit/references/sdk-reference
- CCTP and Gateway on Arc: https://www.circle.com/blog/consolidate-crosschain-usdc-fast-low-cost-transfers-with-cctp-and-gateway
- Circle Arc introduction: https://www.circle.com/blog/introducing-arc-an-open-layer-1-blockchain-purpose-built-for-stablecoin-finance
