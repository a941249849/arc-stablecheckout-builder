import type { Address, Hex } from 'viem'
import type { StableTokenSymbol } from './arc'

export type InvoiceStatus = 'draft' | 'pending' | 'paid' | 'needs-review'

export type RpcDiagnosis = {
  hash: Hex
  publicRpc: 'not-found' | 'pending' | 'receipt'
  walletRpc: 'not-connected' | 'not-found' | 'pending' | 'receipt' | 'wrong-chain' | 'error'
  walletChainId?: string
  message: string
  checkedAt: string
}

export type PaymentProof = {
  txHash: Hex
  rpcStatus: string
  blockNumber: bigint
  blockHash: Hex
  transactionIndex: number
  from: Address
  to: Address
  token: StableTokenSymbol
  tokenAddress: Address
  amount: string
  rawAmount: string
  estimatedGas?: string
  estimatedFeeUsdc?: string
  gasUsed?: string
  effectiveGasPrice?: string
  feePaidUsdc?: string
  nativeBalanceBefore?: string
  nativeBalanceAfter?: string
  tokenBalanceBefore?: string
  tokenBalanceAfter?: string
  transferLogIndex?: number
  memoStatus: 'not-used' | 'pending-evaluation' | 'unsupported'
  reconciledAt: string
}

export type Invoice = {
  id: string
  recipient: Address
  amount: string
  token: StableTokenSymbol
  reference: string
  status: InvoiceStatus
  createdAt: string
  txHash?: Hex
  proof?: PaymentProof
  rpcDiagnosis?: RpcDiagnosis
}

const storageKey = 'arc-payops-invoices-v2'

export function createInvoice(input: {
  recipient: Address
  amount: string
  token: StableTokenSymbol
}): Invoice {
  const suffix = Math.random().toString(36).slice(2, 10).toUpperCase()
  const id = `ARC-${suffix}`
  return {
    id,
    reference: id,
    recipient: input.recipient,
    amount: input.amount,
    token: input.token,
    status: 'pending',
    createdAt: new Date().toISOString(),
  }
}

export function loadInvoices(): Invoice[] {
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return []
    return JSON.parse(raw) as Invoice[]
  } catch {
    return []
  }
}

export function saveInvoices(invoices: Invoice[]): void {
  window.localStorage.setItem(storageKey, JSON.stringify(invoices))
}

export function shortAddress(value: string): string {
  if (!value) return ''
  return `${value.slice(0, 6)}...${value.slice(-4)}`
}

export function normalizeAmount(value: string): string {
  const clean = value.trim()
  if (!clean) return '0'
  return clean
}
