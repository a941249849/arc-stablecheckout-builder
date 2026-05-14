import { createConfig, http } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { defineChain } from 'viem'

export const arcTestnet = defineChain({
  id: 5_042_002,
  name: 'Arc Testnet',
  nativeCurrency: {
    name: 'USDC',
    symbol: 'USDC',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.testnet.arc.network'],
      webSocket: ['wss://rpc.testnet.arc.network'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Arcscan',
      url: 'https://testnet.arcscan.app',
    },
  },
  testnet: true,
})

export const arcChainId = arcTestnet.id
export const arcRpcUrl = arcTestnet.rpcUrls.default.http[0]
export const arcExplorerUrl = arcTestnet.blockExplorers.default.url
export const arcFaucetUrl = 'https://faucet.circle.com'

export const usdcAddress = '0x3600000000000000000000000000000000000000' as const
export const eurcAddress = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a' as const
export const memoContractAddress = '0x9702466268ccF55eAB64cdf484d272Ac08d3b75b' as const

export const stableTokens = [
  {
    symbol: 'USDC',
    name: 'USD Coin',
    address: usdcAddress,
    decimals: 6,
    role: 'default payment and gas asset',
  },
  {
    symbol: 'EURC',
    name: 'Euro Coin',
    address: eurcAddress,
    decimals: 6,
    role: 'secondary payment asset',
  },
] as const

export type StableToken = (typeof stableTokens)[number]
export type StableTokenSymbol = StableToken['symbol']

export const erc20Abi = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: 'balance', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false },
    ],
  },
] as const

export const transferEventAbi = erc20Abi[3]

export const wagmiConfig = createConfig({
  chains: [arcTestnet],
  connectors: [injected()],
  transports: {
    [arcTestnet.id]: http(arcRpcUrl),
  },
})

export function findToken(symbol: StableTokenSymbol): StableToken {
  return stableTokens.find((token) => token.symbol === symbol) ?? stableTokens[0]
}
