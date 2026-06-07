# CMC Agent Hackathon — Track 1: Live Trading Agent

**Project:** Sovereign Trading Agent on BNB Chain
**Track:** Track 1 — Live Trading Agent
**Target:** 3 prizes (stackable) = $16K max
**Deadline:** Jun 21, 2026, 12:00 UTC (17 days)
**Started:** Jun 4, 2026

---

## Prize Targets (Stackable)

| Prize | Amount | Key Requirement |
|-------|--------|-----------------|
| Track 1st Place | $10,000 | Best autonomous agent + real PnL |
| Best Use of TWAK | $2,000 | Full self-custody, autonomous mode, x402 |
| Best Use of CMC Data | $2,000 | Deep MCP + Skills + x402 integration |
| Best Use of BNB SDK | $2,000 | ERC-8004 + ERC-8183 integration |

**Total potential: $16,000**

---

## Architecture (Revised)

```
┌──────────────────────────────────────────────────────┐
│                 Sovereign Trading Agent              │
│                                                      │
│  ┌──────────────┐    ┌──────────────┐                │
│  │  CMC MCP     │    │  TWAK CLI    │                │
│  │  Server      │───→│  (execution) │                │
│  │  (data+x402) │    │  (self-custody)               │
│  └──────┬───────┘    └──────┬───────┘                │
│         │                   │                        │
│         ▼                   ▼                        │
│  ┌──────────────┐    ┌──────────────┐                │
│  │   Signal     │───→│   Strategy   │                │
│  │   Normalizer │    │   Engine     │                │
│  └──────────────┘    └──────┬───────┘                │
│                             │                        │
│                             ▼                        │
│                     ┌──────────────┐                 │
│                     │  Risk/Policy │                 │
│                     │  Engine      │                 │
│                     └──────┬───────┘                 │
│                            │                         │
│                            ▼                         │
│                     ┌──────────────┐                 │
│                     │  TWAK        │                 │
│                     │  Execution   │                 │
│                     └──────┬───────┘                 │
│                            │                         │
│                            ▼                         │
│                     BSC On-Chain Tx                  │
│                            │                         │
│                            ▼                         │
│                     ┌──────────────┐                 │
│                     │ Proof Ledger │                 │
│                     │ (tx hash +   │                 │
│                     │  reasoning)  │                 │
│                     └──────────────┘                 │
│                                                      │
│  ┌─────────────────────────────────────────────────┐ │
│  │ BNB Agent SDK                                   │ │
│  │ - ERC-8004: Agent Identity (on-chain)           │ │
│  │ - X402Signer: Micropayment gating               │ │
│  └─────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

**Key insight:** CMC x402 runs natively on **BNB Chain** via TWAK. No separate Base wallet needed.

---

## Risk/Policy Engine (MUST HAVE)

```
Input: Strategy signal (BUY/SELL/HOLD)
│
├─ Token allowlist check → reject if not in top 50 BSC tokens
├─ Position size check → max 10% of portfolio per trade
├─ Daily loss limit → stop trading if -5% daily drawdown
├─ Max drawdown → emergency stop at -15% total
├─ Slippage check → max 2% tolerance
├─ Cooldown → min 5 min between trades
│
Output: APPROVED / REJECTED + reason
```

---

## Build Order (Dual-Model Consensus)

### Phase 1: Foundation (Jun 4-6)
1. **CMC MCP data pipeline** — get 3-5 signals flowing
2. **Risk/Policy engine** — hard rules, no trade bypasses
3. **TWAK install + first swap** — testnet then mainnet with tiny amount

### Phase 2: Core Loop (Jun 7-10)
4. **Strategy engine** — DCA first (simplest, most reliable)
5. **Proof ledger** — every decision logged with reasoning
6. **ERC-8004 registration** — on-chain agent identity

### Phase 3: Differentiation (Jun 11-14)
7. **x402 micropayments** — pay for CMC data per request
8. **CMC signal depth** — trending, sentiment, whale alerts, Fear & Greed
9. **Second strategy** — momentum OR mean reversion (not both)

### Phase 4: Polish (Jun 15-18)
10. **Demo video** — real trades, real tx hashes, real PnL
11. **Documentation** — architecture diagram, setup guide
12. **Performance metrics** — Sharpe, win rate, max drawdown

### Phase 5: Submit (Jun 19-21)
13. **Final testing** — fresh wallet, full loop
14. **Dorahacks submission** — video + repo + on-chain proof

---

## Scoring Checklist

### TWAK Prize (25+30+20+10+10+5 = 100 pts)
- [ ] TWAK as sole execution layer (30)
- [ ] Full self-custody, local signing (25)
- [ ] Autonomous mode with guardrails (20)
- [ ] x402 micropayments (10)
- [ ] Originality — "sovereign agent" narrative (10)
- [ ] Demo with on-chain proof (5)

### CMC Data Prize (30+25+20+15+10 = 100 pts)
- [ ] CMC MCP deep integration (30)
- [ ] Signals beyond price — sentiment, trending, whale (25)
- [ ] Agent-native: MCP + x402 + Skills (20)
- [ ] Originality (15)
- [ ] Demo quality (10)

### BNB SDK Prize (30+25+20+15+10 = 100 pts)
- [ ] ERC-8004 registration (30)
- [ ] On-chain execution quality (25)
- [ ] ERC-8183 service endpoint (20)
- [ ] Originality (15)
- [ ] Demo quality (10)

---

## Differentiation Strategy

1. **Real on-chain trades** — not mock data, actual BSC transactions
2. **x402 native** — agent pays for its own data
3. **"Sovereign economic agent" narrative** — own wallet, own identity, own decisions
4. **Proof ledger** — transparent decision log with CMC data → reasoning → trade → result
5. **Performance metrics** — run 12-24h before demo, show real returns

---

## Known Risks

| Risk | Mitigation |
|------|------------|
| TWAK CLI immature | Budget 4h for debugging, fallback to ethers.js |
| CMC MCP flaky | Cache data, fallback to direct CMC API |
| ~~x402 on Base not BSC~~ | x402 native on BNB Chain via TWAK |
| Strategy loses money | Risk engine hard stops, small position sizes |
| BNB SDK unstable | Pin versions, ERC-8004 only (skip 8183 if time) |
| Live demo fails | Pre-record backup video |

---

## Credential Requirements

| Item | Source | Status |
|------|--------|--------|
| TWAK API key | portal.trustwallet.com | TODO |
| CMC API key | coinmarketcap.com/api | TODO |
| BSC wallet | Existing (0x0b14...) | Ready |
| x402 payments | TWAK native on BSC | Ready |
| GitHub repo | Create under account | TODO |
| Dorahacks account | dorahacks.io | TODO |
