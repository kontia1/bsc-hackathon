# Task Breakdown — BSC Hackathon

## Phase 1: Setup (Jun 4-5)

### T1.1 — TWAK Installation & Config
- [ ] Install `@trustwallet/cli` globally
- [ ] Get API credentials from portal.trustwallet.com
- [ ] Test `twak price ETH` basic commands
- [ ] Test `twak serve` MCP server mode
- [ ] Verify BSC chain support

### T1.2 — BNB Agent SDK Setup
- [ ] `pip install bnbagent[server,ipfs]`
- [ ] Create agent wallet (or reuse existing)
- [ ] Register agent via ERC-8004 on BSC Testnet
- [ ] Test ERC-8183 server setup
- [ ] Verify on-chain registration tx

### T1.3 — CMC Agent Hub Setup
- [ ] Get CMC API key (basic tier, free)
- [ ] Configure MCP server for CMC data
- [ ] Test x402 gated data access
- [ ] List available Skills on Agent Hub
- [ ] Test data signals: price, volume, sentiment, trending

### T1.4 — Project Structure
- [ ] Initialize GitHub repo
- [ ] Setup env variables (.env.example)
- [ ] Create README with setup instructions
- [ ] Setup test framework

---

## Phase 2: Core Agent (Jun 6-10)

### T2.1 — Data Pipeline
- [ ] CMC MCP → structured market data
- [ ] Price feed (real-time via TWAK)
- [ ] Volume/liquidity signals
- [ ] Token risk scoring

### T2.2 — Strategy Engine
- [ ] Signal aggregation (CMC + on-chain)
- [ ] Entry/exit decision logic
- [ ] Position sizing (Kelly criterion or fixed %)
- [ ] Risk management (drawdown caps, max position)

### T2.3 — Execution Engine
- [ ] TWAK autonomous mode setup
- [ ] Swap execution via TWAK
- [ ] Transaction confirmation + logging
- [ ] Error handling + retry logic

### T2.4 — Guardrails
- [ ] Max drawdown limit (e.g., 10%)
- [ ] Token allowlist (top 50 BSC tokens)
- [ ] Slippage tolerance (max 2%)
- [ ] Daily trade limit
- [ ] Emergency stop mechanism

---

## Phase 3: Strategies (Jun 11-14)

### T3.1 — DCA Strategy
- [ ] Fixed interval buys
- [ ] TWAK automation mode
- [ ] x402 paid data for timing optimization

### T3.2 — Momentum Strategy
- [ ] CMC trending tokens signal
- [ ] Volume spike detection
- [ ] Entry on breakout, exit on reversal

### T3.3 — Mean Reversion
- [ ] Oversold detection (RSI-like via CMC data)
- [ ] Buy dip, sell recovery
- [ ] Risk-adjusted position sizing

---

## Phase 4: Polish (Jun 15-18)

### T4.1 — Demo Video
- [ ] Screen record agent loop (buy → sell → profit)
- [ ] Show self-custody signing (no 3rd party)
- [ ] Show on-chain BSC tx hashes
- [ ] Show TWAK autonomous mode
- [ ] Show x402 micropayment in action

### T4.2 — Documentation
- [ ] Architecture diagram
- [ ] Setup guide (step-by-step)
- [ ] Strategy explanation
- [ ] Risk management docs

### T4.3 — On-chain Proof
- [ ] Collect all BSC tx hashes
- [ ] Verify on BscScan
- [ ] Create proof document

---

## Phase 5: Submit (Jun 19-21)

### T5.1 — Final Testing
- [ ] Full agent loop test (fresh wallet)
- [ ] Edge case testing (network failure, low balance)
- [ ] Performance metrics (win rate, PnL)

### T5.2 — Dorahacks Submission
- [ ] Create submission on Dorahacks
- [ ] Upload demo video
- [ ] Link GitHub repo
- [ ] Attach on-chain proof
- [ ] Submit before Jun 21 12:00 UTC

---

## Dual-Model Verification Points

| Checkpoint | Opus 4.8 | GPT-5.5 | Action |
|------------|----------|---------|--------|
| Architecture review | ✓ | ✓ | Both must approve |
| Strategy logic | ✓ | ✓ | Cross-verify math |
| Security audit | ✓ | ✓ | Check key handling |
| TWAK integration | ✓ | ✓ | Verify self-custody |
| Final submission | ✓ | ✓ | Both green = submit |
