# Tempo vs Arc Comparison Outline

Last updated: 2026-05-14

This outline should be used after the Arc demo has transaction evidence. It should not be published as a final comparison until Arc has been tested with the same standard used for Tempo.

## Thesis

Tempo and Arc are both stablecoin-focused payment infrastructure, but they optimize around different centers of gravity.

- Tempo is currently strongest as a payment-primitive demo: stablecoin fees, `transferWithMemo`, and direct invoice reconciliation.
- Arc is currently strongest as a Circle-stack settlement environment: USDC gas, App Kit, CCTP, Gateway, stablecoin contracts, compliance tooling, and institutional ecosystem alignment.

The comparison should not be framed as "which chain is hotter." It should be framed as:

> Which stack is easier to turn into a verifiable payment product?

## Evidence Standard

Each side needs:

- Working demo.
- Testnet transaction hash.
- RPC receipt.
- Explorer result or documented explorer limitation.
- Wallet behavior.
- Payment metadata or reconciliation path.
- Clear limitation list.

Tempo already has:

- Live demo.
- Tempo Wallet transaction.
- RPC receipt.
- `TransferWithMemo` memo match.
- Explorer 404 caveat.
- Public X write-up.

Arc still needs:

- Wallet connection proof.
- Testnet USDC send proof.
- Arcscan proof.
- Memo contract feasibility result.
- Invoice status proof.

## Comparison Table

| Dimension | Tempo StablePay | Arc StableCheckout |
| --- | --- | --- |
| Primary asset model | Multiple test stablecoins; stablecoin fee tokens | USDC as native gas; USDC/EURC contracts |
| Payment primitive | `transferWithMemo` | USDC transfer; possible Memo contract extension |
| Invoice reference | Native memo transfer event | Needs Memo contract or application-level reference |
| Proof source | RPC receipt + `TransferWithMemo` log | RPC receipt + ERC-20 `Transfer`; Arcscan if stable |
| Wallet path | Tempo Wallet worked; injected wallets need caution | Standard EVM wallets should connect; USDC gas display must be tested |
| Explorer behavior | Confirmed transaction can 404 on Explorer route | To be verified on Arcscan |
| SDK surface | Wagmi, Viem, `tempo.ts` | Wagmi, Viem, Circle App Kit |
| Crosschain payment path | Not v1 focus | CCTP / App Kit / Gateway are core differentiators |
| Enterprise/compliance angle | Payment metadata, stablecoin fees, privacy/payment lanes in docs | Circle stack, compliance hooks, CCTP, Gateway, institutional ecosystem |
| v1 build complexity | Medium; memo primitive is direct | Medium; basic transfer is direct, memo/reconciliation needs validation |

## Article Structure

1. Recap why Tempo was built first.
2. Explain what Tempo proved and where it still failed.
3. Enter Arc from current official status, not token expectation.
4. Build or test Arc StableCheckout.
5. Compare actual implementation friction.
6. Explain where each stack is more natural:
   - Tempo: invoice memo and direct payment semantics.
   - Arc: USDC settlement, Circle liquidity, crosschain payments, institutional workflow.
7. Close with a practical builder conclusion.

## Decision Rules

Use these rules to keep the comparison rigorous:

- If Arc produces no transaction hash, do not call it a completed demo.
- If Arcscan fails while RPC succeeds, document it exactly as with Tempo.
- If Memo contract usage is unclear, do not imply Arc has the same memo UX as Tempo.
- If App Kit requires credentials or server-side setup, separate that from public frontend capability.
- Do not include token, ICO, or airdrop claims unless they are official and source-linked.

## Likely Public Framing

Recommended angle:

> I built Tempo first because its memo payment primitive was directly testable. Arc is the next test because Circle's stack may make USDC checkout and crosschain settlement stronger, but the standard is the same: can it produce a verifiable payment flow?

This keeps the narrative objective and avoids chasing Arc heat without implementation evidence.
