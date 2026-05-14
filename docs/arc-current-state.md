# Arc Current State Review

Last updated: 2026-05-14

This note records the current Arc build context after the Tempo StablePay demo. It separates official facts, live checks, builder interpretation, and the recommended next implementation scope.

## Official Facts Checked

- Arc is presented as a stablecoin-native Layer-1 network for financial applications, with USDC as gas, sub-second deterministic finality, EVM compatibility, opt-in privacy, and Circle-stack integration.
- Circle announced Arc public testnet on 2025-10-28, describing it as available for developers and enterprises to deploy, test, and build.
- Arc Testnet uses chain ID `5042002`, RPC `https://rpc.testnet.arc.network`, WebSocket `wss://rpc.testnet.arc.network`, currency symbol `USDC`, faucet `https://faucet.circle.com`, and explorer `https://testnet.arcscan.app`.
- Arc docs state that USDC is the native gas token. Native gas accounting uses 18 decimals, while the optional USDC ERC-20 interface uses 6 decimals.
- The Arc Testnet USDC ERC-20 interface is `0x3600000000000000000000000000000000000000`.
- EURC is supported on Arc Testnet at `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a`.
- App Kit supports Arc Testnet for Send, Bridge, Swap, and Unified Balance.
- App Kit Send supports sending USDC on Arc Testnet with `chain: "Arc_Testnet"` and returns a transaction hash plus explorer URL on success.
- Arc provides contract/event monitoring paths through Circle Contracts API. This is relevant for payment confirmation workflows, but requires Circle Console credentials and should not be assumed as available in a public frontend demo.
- Arc Testnet includes a predeployed `Memo` contract at `0x9702466268ccF55eAB64cdf484d272Ac08d3b75b`, described as attaching memo metadata to contract calls and emitting `Memo` events with a sequential index.
- Arc Testnet includes CCTP and Gateway contracts with domain `26`, which makes crosschain USDC workflows more central to Arc than to the first Tempo demo.

## Live Checks

Checked from this repository environment on 2026-05-14:

```txt
RPC: https://rpc.testnet.arc.network
eth_chainId: 0x4cef52 = 5042002
eth_blockNumber: 0x282ea47 = 42134087
eth_gasPrice: 0x4a8270a40 = 20.001 Gwei
```

The RPC is reachable and consistent with the official Arc Testnet chain ID. The gas price aligns with the documented 20 Gwei testnet floor.

`https://testnet.arcscan.app` returned a Cloudflare challenge to direct `curl`, so explorer behavior should be verified in a browser during demo testing rather than judged from CLI reachability alone.

## Builder Interpretation

Arc is currently more buildable than expected if the target is a basic USDC checkout or invoice flow. It has:

- Public testnet RPC.
- Public faucet.
- Standard EVM tooling.
- App Kit Send quickstart.
- Native USDC gas.
- USDC/EURC contracts.
- A predeployed memo contract that can potentially give Arc a payment-reference path comparable to Tempo's memo flow.

The main difference from Tempo is product orientation:

- Tempo's most direct primitive is `transferWithMemo`, which naturally fits invoice reconciliation.
- Arc's most direct path is USDC transfer plus Circle/App Kit infrastructure, with memo/monitoring available as additional layers.

This means the next Arc demo should not simply copy the Tempo UI. The stronger Arc angle is:

```txt
invoice -> USDC payment -> optional Memo contract call -> RPC receipt / Arcscan -> event or transaction proof -> paid
```

If the Memo contract can wrap the USDC transfer cleanly and emit a usable memo event, Arc can be compared directly against Tempo's memo-based reconciliation. If not, the Arc v1 should be framed as USDC checkout plus proof, while memo reconciliation remains a follow-up.

## Current Buildability Verdict

Proceed to Arc build gate.

The current evidence is strong enough to plan an Arc payment demo, but not strong enough to promise the final feature set before live testing. The first build should validate three things in order:

1. Can a browser wallet reliably connect to Arc Testnet and pay gas in USDC?
2. Can the demo send USDC and produce a stable transaction proof?
3. Can the predeployed Memo contract be used to attach invoice metadata without weakening the payment UX?

Do not start with CCTP, Gateway, StableFX, Circle Contracts monitoring, or account abstraction. Those are important Arc differentiators, but they add credential and operational complexity before the base checkout loop is proven.

## Recommended Next Demo

Working name: `Arc StableCheckout`.

Minimum target:

- Connect wallet to Arc Testnet.
- Show USDC and EURC balances.
- Create invoice with recipient, amount, token, and reference.
- Send USDC on Arc Testnet.
- Verify receipt from RPC.
- Link Arcscan transaction.
- Record whether native USDC gas display works correctly in the connected wallet.
- Evaluate Memo contract feasibility.

Stretch target:

- Attach invoice reference through the Arc Memo contract.
- Decode `Memo` and/or ERC-20 `Transfer` logs.
- Build a proof bundle equivalent to Tempo StablePay.
- Add an Arc vs Tempo comparison table backed by transaction evidence.

## Sources

- Arc homepage: https://www.arc.network/
- Arc docs overview: https://docs.arc.network/arc-chain
- Connect to Arc: https://docs.arc.network/integrate/connect-to-arc
- P2P payments: https://docs.arc.network/build/payments
- eCommerce checkout: https://docs.arc.network/build/ecommerce
- App Kit Send: https://docs.arc.network/app-kit/send
- Send tokens quickstart: https://docs.arc.network/app-kit/quickstarts/send-tokens-same-chain
- App Kit supported chains/tokens: https://docs.arc.network/app-kit/references/supported-blockchains
- Gas and fees: https://docs.arc.network/arc/references/gas-and-fees
- Contract addresses: https://docs.arc.network/arc/references/contract-addresses
- Circle public testnet announcement: https://investor.circle.com/news/news-details/2025/Circle-Launches-Arc-Public-Testnet/default.aspx
- Arc node repository: https://github.com/circlefin/arc-node
