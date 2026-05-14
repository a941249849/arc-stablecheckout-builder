import { useEffect, useMemo, useState } from 'react'
import {
  decodeEventLog,
  formatUnits,
  isAddress,
  parseUnits,
  type Address,
  type Hex,
  type TransactionReceipt,
} from 'viem'
import {
  useAccount,
  useConnect,
  useDisconnect,
  usePublicClient,
  useSwitchChain,
  useWalletClient,
} from 'wagmi'
import {
  arcChainId,
  arcExplorerUrl,
  arcFaucetUrl,
  arcRpcUrl,
  arcTestnet,
  erc20Abi,
  findToken,
  memoContractAddress,
  stableTokens,
  transferEventAbi,
} from './arc'
import { copyText } from './copy'
import {
  createInvoice,
  loadInvoices,
  normalizeAmount,
  saveInvoices,
  shortAddress,
  type Invoice,
  type PaymentProof,
} from './invoices'
import './styles.css'

type BalanceState = Record<string, string>
type Notice = { tone: 'info' | 'success' | 'error'; text: string }

const emptyBalances = Object.fromEntries(stableTokens.map((token) => [token.symbol, '-']))

export function App() {
  const { address, chainId, connector, isConnected } = useAccount()
  const { connectors, connectAsync, isPending: isConnecting } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain()
  const publicClient = usePublicClient({ chainId: arcChainId })
  const { data: walletClient } = useWalletClient({ chainId: arcChainId })

  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('1')
  const [tokenSymbol, setTokenSymbol] = useState<'USDC' | 'EURC'>('USDC')
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>()
  const [balances, setBalances] = useState<BalanceState>(emptyBalances)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [manualHash, setManualHash] = useState('')
  const [notice, setNotice] = useState<Notice>({
    tone: 'info',
    text: 'Connect a wallet, create an invoice, then send USDC on Arc Testnet.',
  })

  useEffect(() => {
    setInvoices(loadInvoices())
  }, [])

  useEffect(() => {
    saveInvoices(invoices)
  }, [invoices])

  const selectedToken = useMemo(() => findToken(tokenSymbol), [tokenSymbol])
  const selectedInvoice = invoices.find((invoice) => invoice.id === selectedInvoiceId) ?? invoices[0]
  const isArcNetwork = chainId === arcChainId

  async function refreshBalances() {
    if (!publicClient || !address) return
    setIsRefreshing(true)
    try {
      const next: BalanceState = { ...emptyBalances }
      await Promise.all(
        stableTokens.map(async (token) => {
          const balance = await publicClient.readContract({
            address: token.address,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [address],
          })
          next[token.symbol] = formatUnits(balance, token.decimals)
        }),
      )
      setBalances(next)
    } catch {
      setNotice({ tone: 'error', text: 'Could not refresh Arc balances from RPC.' })
    } finally {
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    void refreshBalances()
  }, [address, publicClient])

  async function connectWallet() {
    const connectorToUse = connectors[0]
    if (!connectorToUse) {
      setNotice({ tone: 'error', text: 'No injected browser wallet detected.' })
      return
    }
    await connectAsync({ connector: connectorToUse })
  }

  async function switchToArc() {
    try {
      await switchChainAsync({
        chainId: arcChainId,
        addEthereumChainParameter: {
          chainName: arcTestnet.name,
          nativeCurrency: arcTestnet.nativeCurrency,
          rpcUrls: [arcRpcUrl],
          blockExplorerUrls: [arcExplorerUrl],
        },
      })
    } catch {
      setNotice({
        tone: 'error',
        text: 'Network switch failed. Add Arc Testnet manually with chain ID 5042002 and RPC https://rpc.testnet.arc.network.',
      })
    }
  }

  function addInvoice() {
    if (!isAddress(recipient)) {
      setNotice({ tone: 'error', text: 'Enter a valid recipient address before creating an invoice.' })
      return
    }
    const normalizedAmount = normalizeAmount(amount)
    if (Number(normalizedAmount) <= 0) {
      setNotice({ tone: 'error', text: 'Amount must be greater than zero.' })
      return
    }
    const invoice = createInvoice({
      recipient: recipient as Address,
      amount: normalizedAmount,
      token: tokenSymbol,
    })
    setInvoices((current) => [invoice, ...current])
    setSelectedInvoiceId(invoice.id)
    setNotice({ tone: 'success', text: `Invoice ${invoice.id} created.` })
  }

  async function sendInvoice(invoice: Invoice) {
    if (!publicClient || !walletClient || !address) {
      setNotice({ tone: 'error', text: 'Connect a wallet on Arc Testnet before sending.' })
      return
    }
    if (!isArcNetwork) {
      setNotice({ tone: 'error', text: 'Switch to Arc Testnet before sending.' })
      return
    }

    const token = findToken(invoice.token)
    const rawAmount = parseUnits(invoice.amount, token.decimals)
    setIsSending(true)
    setSelectedInvoiceId(invoice.id)
    setNotice({ tone: 'info', text: `Submitting ${invoice.amount} ${invoice.token} payment for ${invoice.id}.` })

    try {
      const txHash = await walletClient.writeContract({
        address: token.address,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [invoice.recipient, rawAmount],
        account: address,
        chain: arcTestnet,
      })

      setInvoices((current) =>
        current.map((item) => (item.id === invoice.id ? { ...item, txHash, status: 'pending' } : item)),
      )

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
      const proof = createProofFromReceipt(receipt, invoice, address, rawAmount.toString())

      setInvoices((current) =>
        current.map((item) =>
          item.id === invoice.id
            ? {
                ...item,
                status: proof.transferLogIndex === undefined ? 'needs-review' : 'paid',
                proof,
                txHash,
              }
            : item,
        ),
      )
      await refreshBalances()
      setNotice({
        tone: proof.transferLogIndex === undefined ? 'error' : 'success',
        text:
          proof.transferLogIndex === undefined
            ? 'RPC receipt confirmed, but matching Transfer log was not found.'
            : `Payment proof confirmed for ${invoice.id}.`,
      })
    } catch (error) {
      setNotice({ tone: 'error', text: `Send failed: ${stringifyError(error)}` })
    } finally {
      setIsSending(false)
    }
  }

  async function verifyManualHash() {
    if (!publicClient || !selectedInvoice) return
    const hash = manualHash.trim() as Hex
    if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) {
      setNotice({ tone: 'error', text: 'Enter a valid transaction hash.' })
      return
    }
    try {
      const receipt = await publicClient.getTransactionReceipt({ hash })
      const token = findToken(selectedInvoice.token)
      const rawAmount = parseUnits(selectedInvoice.amount, token.decimals).toString()
      const proof = createProofFromReceipt(receipt, selectedInvoice, receipt.from, rawAmount)
      setInvoices((current) =>
        current.map((item) =>
          item.id === selectedInvoice.id
            ? {
                ...item,
                txHash: hash,
                status: proof.transferLogIndex === undefined ? 'needs-review' : 'paid',
                proof,
              }
            : item,
        ),
      )
      setNotice({ tone: 'success', text: 'Transaction hash verified through Arc RPC.' })
    } catch {
      setNotice({ tone: 'error', text: 'Could not find that transaction through Arc RPC.' })
    }
  }

  function createProofFromReceipt(
    receipt: TransactionReceipt,
    invoice: Invoice,
    payer: Address,
    rawAmount: string,
  ): PaymentProof {
    const token = findToken(invoice.token)
    let transferLogIndex: number | undefined

    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== token.address.toLowerCase()) continue
      try {
        const decoded = decodeEventLog({
          abi: [transferEventAbi],
          data: log.data,
          topics: log.topics,
        })
        if (decoded.eventName !== 'Transfer') continue
        const args = decoded.args
        const fromMatches = args.from.toLowerCase() === payer.toLowerCase()
        const toMatches = args.to.toLowerCase() === invoice.recipient.toLowerCase()
        const valueMatches = args.value.toString() === rawAmount
        if (fromMatches && toMatches && valueMatches) {
          transferLogIndex = log.logIndex
          break
        }
      } catch {
        continue
      }
    }

    return {
      txHash: receipt.transactionHash,
      rpcStatus: receipt.status,
      blockNumber: receipt.blockNumber,
      blockHash: receipt.blockHash,
      transactionIndex: receipt.transactionIndex,
      from: payer,
      to: invoice.recipient,
      token: invoice.token,
      tokenAddress: token.address,
      amount: invoice.amount,
      rawAmount,
      transferLogIndex,
      memoStatus: 'pending-evaluation',
      reconciledAt: new Date().toISOString(),
    }
  }

  function removeInvoice(id: string) {
    setInvoices((current) => current.filter((invoice) => invoice.id !== id))
    if (selectedInvoiceId === id) setSelectedInvoiceId(undefined)
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">ARC TESTNET</span>
          <h1>Arc StableCheckout</h1>
        </div>
        <nav>
          <a href="https://docs.arc.network/" target="_blank" rel="noreferrer">
            Docs
          </a>
          <a href={arcFaucetUrl} target="_blank" rel="noreferrer">
            Faucet
          </a>
          <a href="https://testnet.arcscan.app" target="_blank" rel="noreferrer">
            Arcscan
          </a>
        </nav>
      </header>

      <section className="hero">
        <div>
          <span className="eyebrow">STABLECOIN CHECKOUT BUILDER</span>
          <h2>Verify USDC invoice settlement on Arc</h2>
          <p>
            A public testnet demo for checking whether Arc can support a practical checkout loop:
            invoice creation, USDC payment, RPC receipt proof, transfer-log reconciliation, and explorer
            evidence.
          </p>
          <div className="pills">
            <span>USDC gas</span>
            <span>Arc Testnet</span>
            <span>ERC-20 Transfer proof</span>
            <span>Memo contract evaluation</span>
          </div>
        </div>
        <PaymentCanvas />
      </section>

      <section className="network-card">
        <div>
          <span className="eyebrow">CURRENT BUILD TARGET</span>
          <h3>USDC checkout first, memo reconciliation second</h3>
          <p>
            Arc’s direct path is USDC settlement with predictable USDC gas. The predeployed Memo contract is
            tracked as a validation item, not presented as a completed feature until a live memo payment is
            proven.
          </p>
        </div>
        <dl>
          <div>
            <dt>Chain ID</dt>
            <dd>5042002</dd>
          </div>
          <div>
            <dt>RPC</dt>
            <dd>{arcRpcUrl}</dd>
          </div>
          <div>
            <dt>Memo contract</dt>
            <dd>{memoContractAddress}</dd>
          </div>
        </dl>
      </section>

      <section className="value-card">
        <div>
          <span className="eyebrow">NOT JUST A TRANSFER SCREEN</span>
          <h3>What the demo proves</h3>
        </div>
        <div className="value-grid">
          <article>
            <strong>Invoice state</strong>
            <p>Each payment starts from a local invoice with recipient, amount, token, and reference.</p>
          </article>
          <article>
            <strong>Receipt evidence</strong>
            <p>The app waits for the Arc RPC receipt before changing payment status.</p>
          </article>
          <article>
            <strong>Transfer matching</strong>
            <p>Paid status requires the ERC-20 Transfer log to match payer, recipient, token, and amount.</p>
          </article>
          <article>
            <strong>Copyable proof</strong>
            <p>The proof bundle can be copied into a report with block data, tx hash, and reconciliation status.</p>
          </article>
        </div>
      </section>

      <section className="wallet-card">
        <div>
          <h3>Wallet</h3>
          <p>
            Standard EVM wallets can connect to Arc Testnet. Some wallets may display the gas asset as ETH,
            while the underlying gas accounting is USDC.
          </p>
        </div>
        <div className="wallet-actions">
          {isConnected ? (
            <>
              <span className="address">{shortAddress(address ?? '')}</span>
              <button type="button" onClick={() => disconnect()}>
                Disconnect
              </button>
            </>
          ) : (
            <button type="button" onClick={connectWallet} disabled={isConnecting}>
              {isConnecting ? 'Connecting...' : 'Connect wallet'}
            </button>
          )}
          <button type="button" onClick={switchToArc} disabled={!isConnected || isSwitching || isArcNetwork}>
            {isArcNetwork ? 'Arc Testnet' : 'Switch network'}
          </button>
          <a className="button-link" href={arcFaucetUrl} target="_blank" rel="noreferrer">
            Get test USDC
          </a>
        </div>
        <div className={`notice ${notice.tone}`}>{notice.text}</div>
        <div className="meta-row">
          <span>Connector: {connector?.name ?? 'none'}</span>
          <span>Network: {chainId ?? '-'}</span>
        </div>
      </section>

      <section className="grid">
        <section className="panel">
          <div className="panel-title">
            <h3>Create invoice</h3>
            <strong>{tokenSymbol}</strong>
          </div>
          <label>
            Payment token
            <select value={tokenSymbol} onChange={(event) => setTokenSymbol(event.target.value as 'USDC' | 'EURC')}>
              {stableTokens.map((token) => (
                <option key={token.symbol} value={token.symbol}>
                  {token.symbol}
                </option>
              ))}
            </select>
          </label>
          <label>
            Recipient address
            <div className="inline-input">
              <input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="0x..." />
              <button type="button" onClick={() => address && setRecipient(address)}>
                Use wallet
              </button>
            </div>
          </label>
          <label>
            Amount
            <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" />
          </label>
          <button type="button" className="primary" onClick={addInvoice}>
            Create invoice
          </button>

          <div className="balance-card">
            <span>Selected balance</span>
            <strong>
              {balances[selectedToken.symbol]} {selectedToken.symbol}
            </strong>
          </div>
          <div className="token-grid">
            {stableTokens.map((token) => (
              <button
                type="button"
                className={token.symbol === tokenSymbol ? 'token active' : 'token'}
                key={token.symbol}
                onClick={() => setTokenSymbol(token.symbol)}
              >
                <span>{token.symbol}</span>
                <strong>{balances[token.symbol]}</strong>
              </button>
            ))}
          </div>
          <button type="button" onClick={refreshBalances} disabled={!address || isRefreshing}>
            {isRefreshing ? 'Refreshing...' : 'Refresh balances'}
          </button>
        </section>

        <section className="panel wide">
          <div className="panel-title">
            <h3>Payment proof</h3>
            <strong>{invoices.length}</strong>
          </div>
          <div className="verify-row">
            <input
              value={manualHash}
              onChange={(event) => setManualHash(event.target.value)}
              placeholder="Paste Arc tx hash"
            />
            <button type="button" onClick={verifyManualHash} disabled={!selectedInvoice}>
              Verify tx
            </button>
          </div>
          {selectedInvoice?.proof ? (
            <ProofCard proof={selectedInvoice.proof} invoice={selectedInvoice} />
          ) : (
            <div className="empty-proof">
              Select an invoice and send payment. The proof console will show RPC status, block data, transfer
              log matching, Arcscan link, and Memo contract status.
            </div>
          )}

          <div className="invoice-list">
            {invoices.length === 0 ? (
              <div className="empty-list">No invoices yet.</div>
            ) : (
              invoices.map((invoice) => (
                <article
                  className={invoice.id === selectedInvoice?.id ? 'invoice selected' : 'invoice'}
                  key={invoice.id}
                >
                  <button type="button" className="invoice-main" onClick={() => setSelectedInvoiceId(invoice.id)}>
                    <span>
                      <strong>{invoice.id}</strong>
                      <small>{shortAddress(invoice.recipient)}</small>
                    </span>
                    <span>
                      <strong>
                        {invoice.amount} {invoice.token}
                      </strong>
                      <small className={invoice.status}>{invoice.status}</small>
                    </span>
                    <span>{invoice.reference}</span>
                  </button>
                  <div className="invoice-actions">
                    <button type="button" onClick={() => removeInvoice(invoice.id)}>
                      Delete
                    </button>
                    <button type="button" className="primary" onClick={() => sendInvoice(invoice)} disabled={isSending}>
                      {isSending && selectedInvoiceId === invoice.id ? 'Sending...' : 'Send'}
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </section>
    </main>
  )
}

function PaymentCanvas() {
  return (
    <div className="canvas" aria-label="Arc checkout flow">
      <div className="canvas-note">
        <span>ARC CHECKOUT FLOW</span>
        <strong>USDC settlement with verifiable proof</strong>
      </div>
      <div className="flow-row">
        <FlowNode title="Invoice" detail="ARC-TESTNET" />
        <FlowArrow />
        <FlowNode title="Wallet" detail="USDC gas" />
        <FlowArrow />
        <FlowNode title="Arc" detail="Sub-second finality" dark />
        <FlowArrow />
        <FlowNode title="Merchant" detail="Paid" />
      </div>
      <div className="proof-line">
        <span>ERC-20 Transfer</span>
        <span>RPC receipt</span>
        <span>Arcscan</span>
      </div>
    </div>
  )
}

function FlowNode({ title, detail, dark = false }: { title: string; detail: string; dark?: boolean }) {
  return (
    <div className={dark ? 'flow-node dark' : 'flow-node'}>
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  )
}

function FlowArrow() {
  return <div className="flow-arrow" aria-hidden="true" />
}

function ProofCard({ proof, invoice }: { proof: PaymentProof; invoice: Invoice }) {
  const explorerUrl = `${arcExplorerUrl}/tx/${proof.txHash}`
  const proofText = [
    `invoice: ${invoice.id}`,
    `tx hash: ${proof.txHash}`,
    `rpc: ${arcRpcUrl}`,
    `status: ${proof.rpcStatus}`,
    `block: ${proof.blockNumber.toString()}`,
    `block hash: ${proof.blockHash}`,
    `from: ${proof.from}`,
    `recipient: ${proof.to}`,
    `token: ${proof.token}`,
    `token contract: ${proof.tokenAddress}`,
    `amount: ${proof.amount}`,
    `raw amount: ${proof.rawAmount}`,
    `transfer log index: ${proof.transferLogIndex ?? 'not matched'}`,
    `memo status: ${proof.memoStatus}`,
    `reconciled at: ${proof.reconciledAt}`,
  ].join('\n')

  return (
    <div className="proof-card">
      <div className="proof-head">
        <span>Onchain proof</span>
        <strong>{proof.transferLogIndex === undefined ? 'Needs review' : 'Transfer matched'}</strong>
        <button type="button" onClick={() => void copyText(proofText)}>
          Copy proof
        </button>
      </div>
      <ProofRow label="Transaction" value={proof.txHash} copy />
      <ProofRow label="RPC receipt" value={proof.rpcStatus} />
      <ProofRow label="Block" value={proof.blockNumber.toString()} />
      <ProofRow label="Block hash" value={proof.blockHash} copy />
      <ProofRow label="From" value={proof.from} copy />
      <ProofRow label="To" value={proof.to} copy />
      <ProofRow label="Token" value={`${proof.amount} ${proof.token}`} />
      <ProofRow label="Token contract" value={proof.tokenAddress} copy />
      <ProofRow label="Transfer log" value={proof.transferLogIndex?.toString() ?? 'not matched'} />
      <ProofRow label="Memo status" value="Memo contract pending validation in v1" />
      <div className="proof-actions">
        <a href={explorerUrl} target="_blank" rel="noreferrer">
          Arcscan tx
        </a>
      </div>
    </div>
  )
}

function ProofRow({ label, value, copy = false }: { label: string; value: string; copy?: boolean }) {
  return (
    <div className="proof-row">
      <span>{label}</span>
      <code>{value}</code>
      {copy ? (
        <button type="button" onClick={() => void copyText(value)}>
          Copy
        </button>
      ) : null}
    </div>
  )
}

function stringifyError(error: unknown): string {
  if (error instanceof Error) return error.message.split('\n')[0] ?? error.message
  return 'unknown error'
}
