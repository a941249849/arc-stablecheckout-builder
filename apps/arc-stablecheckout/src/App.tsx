import { useEffect, useMemo, useState } from 'react'
import {
  decodeEventLog,
  formatUnits,
  isAddress,
  parseGwei,
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
  type RpcDiagnosis,
} from './invoices'
import './styles.css'

type BalanceState = Record<string, string>
type Notice = { tone: 'info' | 'success' | 'error'; text: string }

const emptyBalances = Object.fromEntries(stableTokens.map((token) => [token.symbol, '-']))
const unavailable = '-'
const preflightTimeoutMs = 8_000
const minArcMaxFeePerGas = parseGwei('30')
const arcPriorityFeePerGas = parseGwei('2')

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
  const [nativeBalance, setNativeBalance] = useState(unavailable)
  const [gasPrice, setGasPrice] = useState(unavailable)
  const [latestBlock, setLatestBlock] = useState(unavailable)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [manualHash, setManualHash] = useState('')
  const [notice, setNotice] = useState<Notice>({
    tone: 'info',
    text: 'Connect a wallet to measure Arc balances, USDC gas, and payment proof.',
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

  async function refreshPayOpsState() {
    if (!publicClient) return
    setIsRefreshing(true)
    try {
      const [nextGasPrice, nextBlock] = await Promise.all([publicClient.getGasPrice(), publicClient.getBlockNumber()])
      setGasPrice(formatUnits(nextGasPrice, 18))
      setLatestBlock(nextBlock.toString())

      if (!address) return

      const [native, tokenEntries] = await Promise.all([
        publicClient.getBalance({ address }),
        Promise.all(
          stableTokens.map(async (token) => {
            const balance = await publicClient.readContract({
              address: token.address,
              abi: erc20Abi,
              functionName: 'balanceOf',
              args: [address],
            })
            return [token.symbol, formatUnits(balance, token.decimals)] as const
          }),
        ),
      ])
      setNativeBalance(formatUnits(native, 18))
      setBalances(Object.fromEntries(tokenEntries))
    } catch {
      setNotice({ tone: 'error', text: 'Could not refresh Arc PayOps state from RPC.' })
    } finally {
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    void refreshPayOpsState()
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
      setNotice({ tone: 'error', text: 'Enter a valid settlement recipient address.' })
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
    setNotice({ tone: 'success', text: `Settlement item ${invoice.id} created.` })
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
    setNotice({ tone: 'info', text: `Preflight: checking gas, balances, and settlement parameters for ${invoice.id}.` })

    let submittedHash: Hex | undefined

    try {
      const [estimatedGas, estimatedGasPrice, nativeBefore, tokenBefore] = await Promise.all([
        settleOptional(
          withTimeout(
            publicClient.estimateContractGas({
              account: address,
              address: token.address,
              abi: erc20Abi,
              functionName: 'transfer',
              args: [invoice.recipient, rawAmount],
            }),
            preflightTimeoutMs,
          ),
        ),
        settleOptional(withTimeout(publicClient.getGasPrice(), preflightTimeoutMs)),
        settleOptional(withTimeout(publicClient.getBalance({ address }), preflightTimeoutMs)),
        settleOptional(withTimeout(readTokenBalance(address, token.symbol), preflightTimeoutMs)),
      ])

      setNotice({
        tone: 'info',
        text: `Wallet step: confirm ${invoice.amount} ${invoice.token} settlement for ${invoice.id}. Arc fee params are set to avoid underpriced pending txs.`,
      })
      const feeParams = buildArcFeeParams(estimatedGasPrice, estimatedGas)

      const txHash = await walletClient.writeContract({
        address: token.address,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [invoice.recipient, rawAmount],
        account: address,
        chain: arcTestnet,
        maxFeePerGas: feeParams.maxFeePerGas,
        maxPriorityFeePerGas: feeParams.maxPriorityFeePerGas,
        ...(feeParams.gas ? { gas: feeParams.gas } : {}),
      })
      submittedHash = txHash

      setInvoices((current) =>
        current.map((item) => (item.id === invoice.id ? { ...item, txHash, status: 'pending' } : item)),
      )
      setNotice({
        tone: 'info',
        text: `Broadcast step: wallet returned tx ${shortAddress(txHash)}. Waiting for Arc RPC receipt.`,
      })

      const broadcastDiagnosis = await diagnoseSubmittedTransaction(txHash)
      if (broadcastDiagnosis.publicRpc === 'not-found') {
        setManualHash(txHash)
        setInvoices((current) =>
          current.map((item) =>
            item.id === invoice.id ? { ...item, status: 'needs-review', rpcDiagnosis: broadcastDiagnosis } : item,
          ),
        )
        setNotice({
          tone: 'error',
          text: broadcastDiagnosis.message,
        })
        return
      }

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 90_000 })
      const [nativeAfter, tokenAfter] = await Promise.all([
        settleOptional(withTimeout(publicClient.getBalance({ address }), preflightTimeoutMs)),
        settleOptional(withTimeout(readTokenBalance(address, token.symbol), preflightTimeoutMs)),
      ])
      const proof = createProofFromReceipt(receipt, invoice, address, rawAmount.toString(), {
        estimatedGas,
        estimatedGasPrice,
        nativeBefore,
        nativeAfter,
        tokenBefore,
        tokenAfter,
      })

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
      await refreshPayOpsState()
      setNotice({
        tone: proof.transferLogIndex === undefined ? 'error' : 'success',
        text:
          proof.transferLogIndex === undefined
            ? 'Receipt confirmed, but the expected Transfer log was not found.'
            : `Settlement proof confirmed for ${invoice.id}. Gas and balance deltas captured.`,
      })
    } catch (error) {
      if (submittedHash) {
        const diagnosis = await diagnoseSubmittedTransaction(submittedHash)
        setInvoices((current) =>
          current.map((item) =>
            item.id === invoice.id
              ? { ...item, txHash: submittedHash, status: 'needs-review', rpcDiagnosis: diagnosis }
              : item,
          ),
        )
        setManualHash(submittedHash)
        setNotice({
          tone: diagnosis.walletRpc === 'receipt' ? 'error' : 'info',
          text: diagnosis.message,
        })
      } else {
        setNotice({ tone: 'error', text: `Send failed before tx submission: ${stringifyError(error)}` })
      }
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
                rpcDiagnosis: undefined,
              }
            : item,
        ),
      )
      setNotice({ tone: 'success', text: 'Transaction hash verified through Arc RPC.' })
    } catch {
      const diagnosis = await diagnoseSubmittedTransaction(hash)
      setInvoices((current) =>
        current.map((item) =>
          item.id === selectedInvoice.id
            ? {
                ...item,
                txHash: hash,
                status: 'needs-review',
                rpcDiagnosis: diagnosis,
              }
            : item,
        ),
      )
      setNotice({
        tone: diagnosis.walletRpc === 'not-found' || diagnosis.walletRpc === 'not-connected' ? 'error' : 'info',
        text: diagnosis.message,
      })
    }
  }

  async function diagnoseSubmittedTransaction(hash: Hex): Promise<RpcDiagnosis> {
    const checkedAt = new Date().toISOString()
    await delay(2_500)

    try {
      await publicClient?.getTransactionReceipt({ hash })
      return {
        hash,
        publicRpc: 'receipt',
        walletRpc: 'not-connected',
        message: 'Arc public RPC returns a receipt for this hash. Verify again to build the full proof bundle.',
        checkedAt,
      }
    } catch {
      // Continue to transaction visibility checks.
    }

    let publicRpc: RpcDiagnosis['publicRpc'] = 'not-found'
    try {
      await publicClient?.getTransaction({ hash })
      publicRpc = 'pending'
    } catch {
      publicRpc = 'not-found'
    }

    if (!walletClient) {
      return {
        hash,
        publicRpc,
        walletRpc: 'not-connected',
        message:
          publicRpc === 'pending'
            ? 'Arc public RPC can see this transaction but no receipt is available yet. Keep the hash and verify again shortly.'
            : 'Arc public RPC cannot find this transaction, and no connected wallet RPC is available for fallback verification. This usually means the wallet did not effectively broadcast it.',
        checkedAt,
      }
    }

    try {
      const request = walletClient.request as unknown as (args: {
        method: string
        params?: unknown[]
      }) => Promise<unknown>
      const walletChainId = (await request({ method: 'eth_chainId' })) as string
      if (walletChainId.toLowerCase() !== `0x${arcChainId.toString(16)}`) {
        return {
          hash,
          publicRpc,
          walletRpc: 'wrong-chain',
          walletChainId,
          message:
            'Arc public RPC does not return a receipt, and the connected wallet RPC is not on Arc Testnet. Switch wallet network and verify again.',
          checkedAt,
        }
      }

      const [walletReceipt, walletTx] = await Promise.all([
        request({ method: 'eth_getTransactionReceipt', params: [hash] }),
        request({ method: 'eth_getTransactionByHash', params: [hash] }),
      ])

      if (walletReceipt) {
        return {
          hash,
          publicRpc,
          walletRpc: 'receipt',
          walletChainId,
          message:
            'Wallet RPC returns a receipt, but Arc public RPC does not. Treat this as an RPC propagation mismatch; public proof is not complete until Arc public RPC or Arcscan can verify it.',
          checkedAt,
        }
      }

      if (walletTx) {
        return {
          hash,
          publicRpc,
          walletRpc: 'pending',
          walletChainId,
          message:
            publicRpc === 'pending'
              ? 'Arc public RPC and wallet RPC can both see this transaction, but no receipt is available yet. Re-check with Verify tx shortly.'
              : 'Wallet RPC sees the transaction, but Arc public RPC cannot find it. This is an RPC propagation mismatch; re-check with Verify tx, but do not submit duplicate payments until status is clear.',
          checkedAt,
        }
      }

      return {
        hash,
        publicRpc,
        walletRpc: 'not-found',
        walletChainId,
        message:
          publicRpc === 'pending'
            ? 'Arc public RPC can see this transaction, but the connected wallet RPC cannot. Re-check with Verify tx shortly.'
            : 'Neither Arc public RPC nor the connected wallet RPC can find this hash. The wallet returned a hash, but the transaction was likely not broadcast or was dropped before propagation.',
        checkedAt,
      }
    } catch {
      return {
        hash,
        publicRpc,
        walletRpc: 'error',
        message:
          'Arc public RPC does not return a receipt, and the connected wallet RPC fallback check failed. Reconnect the wallet, confirm Arc Testnet, then verify again.',
        checkedAt,
      }
    }
  }

  async function readTokenBalance(owner: Address, symbol: 'USDC' | 'EURC'): Promise<bigint> {
    if (!publicClient) return 0n
    const token = findToken(symbol)
    return publicClient.readContract({
      address: token.address,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [owner],
    })
  }

  function createProofFromReceipt(
    receipt: TransactionReceipt,
    invoice: Invoice,
    payer: Address,
    rawAmount: string,
    telemetry?: {
      estimatedGas?: bigint
      estimatedGasPrice?: bigint
      nativeBefore?: bigint
      nativeAfter?: bigint
      tokenBefore?: bigint
      tokenAfter?: bigint
    },
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

    const feePaid = receipt.effectiveGasPrice ? receipt.gasUsed * receipt.effectiveGasPrice : undefined
    const estimatedFee =
      telemetry?.estimatedGas && telemetry.estimatedGasPrice
        ? telemetry.estimatedGas * telemetry.estimatedGasPrice
        : undefined

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
      estimatedGas: telemetry?.estimatedGas?.toString(),
      estimatedFeeUsdc: estimatedFee ? formatUnits(estimatedFee, 18) : undefined,
      gasUsed: receipt.gasUsed.toString(),
      effectiveGasPrice: receipt.effectiveGasPrice ? formatUnits(receipt.effectiveGasPrice, 18) : undefined,
      feePaidUsdc: feePaid ? formatUnits(feePaid, 18) : undefined,
      nativeBalanceBefore: telemetry?.nativeBefore ? formatUnits(telemetry.nativeBefore, 18) : undefined,
      nativeBalanceAfter: telemetry?.nativeAfter ? formatUnits(telemetry.nativeAfter, 18) : undefined,
      tokenBalanceBefore: telemetry?.tokenBefore ? formatUnits(telemetry.tokenBefore, token.decimals) : undefined,
      tokenBalanceAfter: telemetry?.tokenAfter ? formatUnits(telemetry.tokenAfter, token.decimals) : undefined,
      transferLogIndex,
      memoStatus: 'pending-evaluation',
      reconciledAt: new Date().toISOString(),
    }
  }

  function removeInvoice(id: string) {
    setInvoices((current) => current.filter((invoice) => invoice.id !== id))
    if (selectedInvoiceId === id) setSelectedInvoiceId(undefined)
    setNotice({ tone: 'info', text: 'Settlement item removed.' })
  }

  const proofCount = invoices.filter((invoice) => invoice.proof).length

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">ARC TESTNET</span>
          <h1>Arc PayOps Console</h1>
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
          <span className="eyebrow">STABLECOIN TREASURY OPERATIONS</span>
          <h2>Measure settlement, gas, and proof on Arc</h2>
          <p>
            This build treats Arc as a USDC-native operations layer: balances, gas accounting, settlement
            evidence, and reconciliation status are captured together instead of presenting another generic
            transfer screen.
          </p>
          <div className="pills">
            <span>USDC native gas</span>
            <span>Balance delta</span>
            <span>Transfer log proof</span>
            <span>CCTP / Gateway gate</span>
          </div>
        </div>
        <PayOpsCanvas />
      </section>

      <section className="metric-grid">
        <MetricCard label="Native gas balance" value={nativeBalance} suffix="USDC" />
        <MetricCard label="Current gas price" value={gasPrice} suffix="USDC / gas" />
        <MetricCard label="Latest Arc block" value={latestBlock} />
        <MetricCard label="Proof bundles" value={proofCount.toString()} />
      </section>

      <section className="wallet-card">
        <div>
          <h3>Wallet and network</h3>
          <p>
            Arc uses USDC as the native gas asset. The console separates native gas accounting from the
            6-decimal ERC-20 interface used for application transfers.
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
            Get test stablecoins
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
            <h3>Create settlement item</h3>
            <strong>{tokenSymbol}</strong>
          </div>
          <label>
            Settlement token
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
            Create item
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
          <button type="button" onClick={refreshPayOpsState} disabled={isRefreshing}>
            {isRefreshing ? 'Refreshing...' : 'Refresh PayOps state'}
          </button>
        </section>

        <section className="panel wide">
          <div className="panel-title">
            <h3>Settlement proof</h3>
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
          ) : selectedInvoice?.txHash ? (
            <PendingTxCard
              invoice={selectedInvoice}
              diagnosis={selectedInvoice.rpcDiagnosis}
              onCopy={() => void copyText(selectedInvoice.txHash ?? '')}
            />
          ) : (
            <div className="empty-proof">
              Send a settlement item or verify a transaction hash. The console will show RPC status, gas paid,
              balance deltas, transfer-log matching, Arcscan link, and Memo status.
            </div>
          )}

          <div className="invoice-list">
            {invoices.length === 0 ? (
              <div className="empty-list">No settlement items yet.</div>
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
                    <span>
                      {invoice.proof?.feePaidUsdc
                        ? `${invoice.proof.feePaidUsdc} gas USDC`
                        : invoice.txHash
                          ? `tx ${shortAddress(invoice.txHash)}`
                          : invoice.reference}
                    </span>
                  </button>
                  <div className="invoice-actions">
                    <button type="button" onClick={() => removeInvoice(invoice.id)}>
                      Delete
                    </button>
                    <button type="button" className="primary" onClick={() => sendInvoice(invoice)} disabled={isSending}>
                      {isSending && selectedInvoiceId === invoice.id ? 'Sending...' : 'Settle'}
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </section>

      <section className="network-card">
        <div>
          <span className="eyebrow">CURRENT BUILD TARGET</span>
          <h3>PayOps first, bridge and Gateway second</h3>
          <p>
            The v1 product surface validates Arc-specific payment operations: USDC-denominated gas,
            before/after balances, receipt proof, and event reconciliation. CCTP, Gateway, App Kit Send,
            StableFX, and Memo are tracked as gated expansion modules rather than implied features.
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
          <span className="eyebrow">ENGINEERING DEPLOYMENT PLAN</span>
          <h3>What gets validated</h3>
        </div>
        <div className="value-grid">
          <article>
            <strong>PayOps base layer</strong>
            <p>Wallet, balances, USDC gas price, settlement item, receipt, and Transfer proof.</p>
          </article>
          <article>
            <strong>Gas accounting</strong>
            <p>Estimate fee before submit, then capture actual gas used and fee paid in USDC.</p>
          </article>
          <article>
            <strong>Treasury delta</strong>
            <p>Record native USDC and token balances before and after settlement.</p>
          </article>
          <article>
            <strong>Expansion gates</strong>
            <p>App Kit Send, CCTP, Gateway, StableFX, and Memo are tested only when credentials or live proof exist.</p>
          </article>
        </div>
      </section>
    </main>
  )
}

function PayOpsCanvas() {
  return (
    <div className="canvas" aria-label="Arc PayOps flow">
      <div className="canvas-note">
        <span>ARC PAYOPS FLOW</span>
        <strong>USDC treasury layer with auditable settlement</strong>
      </div>
      <div className="flow-row">
        <FlowNode title="Inbound USDC" detail="CCTP / faucet gate" />
        <FlowArrow />
        <FlowNode title="Arc treasury" detail="USDC gas + balances" />
        <FlowArrow />
        <FlowNode title="Settlement" detail="Receipt + event proof" dark />
        <FlowArrow />
        <FlowNode title="Ops record" detail="Copyable evidence" />
      </div>
      <div className="proof-line">
        <span>Fee in USDC</span>
        <span>Balance delta</span>
        <span>Reconciliation</span>
      </div>
    </div>
  )
}

function MetricCard({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {suffix ? <small>{suffix}</small> : null}
    </article>
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

function PendingTxCard({
  invoice,
  diagnosis,
  onCopy,
}: {
  invoice: Invoice
  diagnosis?: RpcDiagnosis
  onCopy: () => void
}) {
  const explorerUrl = invoice.txHash ? `${arcExplorerUrl}/tx/${invoice.txHash}` : undefined

  return (
    <div className="pending-card">
      <div className="proof-head">
        <span>Submitted transaction</span>
        <strong>Awaiting RPC receipt</strong>
        <button type="button" onClick={onCopy}>
          Copy tx
        </button>
      </div>
      <ProofRow label="Settlement item" value={invoice.id} />
      <ProofRow label="Transaction" value={invoice.txHash ?? 'not captured'} copy={Boolean(invoice.txHash)} />
      <ProofRow label="Public RPC" value={diagnosis?.publicRpc ?? 'not checked'} />
      <ProofRow label="Wallet RPC" value={diagnosis?.walletRpc ?? 'not checked'} />
      {diagnosis?.walletChainId ? <ProofRow label="Wallet chain" value={diagnosis.walletChainId} /> : null}
      <ProofRow
        label="Status"
        value={
          diagnosis?.message ??
          'Wallet returned a transaction hash, but Arc public RPC has not returned a receipt yet.'
        }
      />
      <ProofRow label="Next check" value="Keep this hash in Verify tx and re-check after propagation." />
      {explorerUrl ? (
        <div className="proof-actions">
          <a href={explorerUrl} target="_blank" rel="noreferrer">
            Arcscan tx
          </a>
        </div>
      ) : null}
    </div>
  )
}

function ProofCard({ proof, invoice }: { proof: PaymentProof; invoice: Invoice }) {
  const explorerUrl = `${arcExplorerUrl}/tx/${proof.txHash}`
  const proofText = [
    `settlement item: ${invoice.id}`,
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
    `estimated gas: ${proof.estimatedGas ?? 'not captured'}`,
    `estimated fee USDC: ${proof.estimatedFeeUsdc ?? 'not captured'}`,
    `gas used: ${proof.gasUsed ?? 'not captured'}`,
    `fee paid USDC: ${proof.feePaidUsdc ?? 'not captured'}`,
    `native USDC before: ${proof.nativeBalanceBefore ?? 'not captured'}`,
    `native USDC after: ${proof.nativeBalanceAfter ?? 'not captured'}`,
    `${proof.token} before: ${proof.tokenBalanceBefore ?? 'not captured'}`,
    `${proof.token} after: ${proof.tokenBalanceAfter ?? 'not captured'}`,
    `transfer log index: ${proof.transferLogIndex ?? 'not matched'}`,
    `memo status: ${proof.memoStatus}`,
    `reconciled at: ${proof.reconciledAt}`,
  ].join('\n')

  return (
    <div className="proof-card">
      <div className="proof-head">
        <span>PayOps proof</span>
        <strong>{proof.transferLogIndex === undefined ? 'Needs review' : 'Transfer matched'}</strong>
        <button type="button" onClick={() => void copyText(proofText)}>
          Copy proof
        </button>
      </div>
      <ProofRow label="Transaction" value={proof.txHash} copy />
      <ProofRow label="RPC receipt" value={proof.rpcStatus} />
      <ProofRow label="Block" value={proof.blockNumber.toString()} />
      <ProofRow label="From" value={proof.from} copy />
      <ProofRow label="To" value={proof.to} copy />
      <ProofRow label="Token" value={`${proof.amount} ${proof.token}`} />
      <ProofRow label="Token contract" value={proof.tokenAddress} copy />
      <ProofRow label="Estimated fee" value={proof.estimatedFeeUsdc ? `${proof.estimatedFeeUsdc} USDC` : 'not captured'} />
      <ProofRow label="Actual fee" value={proof.feePaidUsdc ? `${proof.feePaidUsdc} USDC` : 'not captured'} />
      <ProofRow label="Gas used" value={proof.gasUsed ?? 'not captured'} />
      <ProofRow label="Native before" value={proof.nativeBalanceBefore ? `${proof.nativeBalanceBefore} USDC` : 'not captured'} />
      <ProofRow label="Native after" value={proof.nativeBalanceAfter ? `${proof.nativeBalanceAfter} USDC` : 'not captured'} />
      <ProofRow label="Token before" value={proof.tokenBalanceBefore ? `${proof.tokenBalanceBefore} ${proof.token}` : 'not captured'} />
      <ProofRow label="Token after" value={proof.tokenBalanceAfter ? `${proof.tokenBalanceAfter} ${proof.token}` : 'not captured'} />
      <ProofRow label="Transfer log" value={proof.transferLogIndex?.toString() ?? 'not matched'} />
      <ProofRow label="Memo status" value="Memo contract pending validation" />
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

function buildArcFeeParams(gasPrice?: bigint, estimatedGas?: bigint) {
  const maxFeePerGas = gasPrice && gasPrice > minArcMaxFeePerGas ? gasPrice + arcPriorityFeePerGas : minArcMaxFeePerGas
  const gas = estimatedGas ? (estimatedGas * 120n) / 100n : undefined

  return {
    gas,
    maxFeePerGas,
    maxPriorityFeePerGas: arcPriorityFeePerGas,
  }
}

async function settleOptional<T>(promise: Promise<T>): Promise<T | undefined> {
  try {
    return await promise
  } catch {
    return undefined
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('timeout')), timeoutMs)
    promise
      .then((value) => {
        window.clearTimeout(timeout)
        resolve(value)
      })
      .catch((error: unknown) => {
        window.clearTimeout(timeout)
        reject(error)
      })
  })
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}
