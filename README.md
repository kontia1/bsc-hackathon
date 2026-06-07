# Sovereign Trading Agent — BNB Hack: AI Trading Agent Edition

Autonomous trading agent on BNB Chain using CMC data for regime detection, ICT analysis for technical signals, and TWAK for self-custody execution.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Sovereign Trading Agent                   │
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │  CMC Data   │    │  ICT        │    │  TWAK       │     │
│  │  Pipeline   │───→│  Technical  │───→│  Execution  │     │
│  │  (regime +  │    │  Analysis   │    │  (self-     │     │
│  │  momentum)  │    │  (OTE, OB,  │    │  custody)   │     │
│  └──────┬──────┘    │  FVG, RSI)  │    └──────┬──────┘     │
│         │           └──────┬──────┘           │            │
│         ▼                  ▼                  ▼            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Strategy Engine (DCA)                   │   │
│  │  CMC 40% + ICT 60% → Combined Score → Entry Signal  │   │
│  └────────────────────────┬────────────────────────────┘   │
│                           ▼                                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Risk/Policy Engine                      │   │
│  │  Token allowlist │ Position size │ Daily loss limit  │   │
│  │  Max drawdown    │ Slippage      │ Cooldown          │   │
│  └────────────────────────┬────────────────────────────┘   │
│                           ▼                                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Proof Ledger                            │   │
│  │  Decision log │ Reasoning │ TX hashes │ Risk checks  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  BNB Agent SDK                                      │   │
│  │  • ERC-8004: Agent Identity (on-chain)              │   │
│  │  • ERC-8183: Commerce Protocol                      │   │
│  │  • X402Signer: Micropayment gating                  │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Components

| Module | File | Description |
|--------|------|-------------|
| CMC Data | `src/cmc.js` | Fear & Greed, momentum, trending, sentiment, token universe |
| ICT Analysis | `src/ict.js` | OTE zones, Order Blocks, FVG, RSI, Elliott Wave, volume |
| Strategy | `src/strategy.js` | DCA loop: regime → signal → risk check → execute |
| Risk Engine | `src/risk.js` | 8 hard rules: allowlist, position size, drawdown, cooldown |
| Proof Ledger | `src/ledger.js` | Decision log with reasoning chain and TX hashes |
| TWAK | `src/twak.js` | Self-custody execution via Trust Wallet Agent Kit |
| BNB SDK | `src/bnb-sdk.js` | ERC-8004 identity, ERC-8183 commerce, x402 |
| Metrics | `src/metrics.js` | Sharpe, win rate, drawdown, profit factor |
| Eligible Tokens | `config/eligible-tokens.js` | 149 hackathon-approved BEP-20 tokens |

## Setup

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your keys

# Initialize TWAK
npx twak init --api-key <ACCESS_ID> --api-secret <HMAC_SECRET>
npx twak wallet create --password <WALLET_PASSWORD>

# Run analysis (dry run)
node index.js --demo

# Run strategy (autonomous)
node index.js --run
```

## Environment Variables

See `.env.example` for required variables:
- `TW_ACCESS_ID` / `TW_HMAC_SECRET` — TWAK API credentials
- `WALLET_ADDRESS` — Agent wallet address
- `CMC_API_KEY` — CoinMarketCap API key
- `BSC_RPC_URL` — BSC RPC endpoint
- `ALCHEMY_API_KEY` — Alchemy API key (optional)

## Risk Rules

| Rule | Limit | Action |
|------|-------|--------|
| Token allowlist | 149 eligible tokens | Reject if not in list |
| Position size | Max 10% per trade | Reject oversized |
| Daily loss | -5% | Stop trading |
| Max drawdown | -15% | Emergency stop |
| Slippage | Max 2% | Reject if too high |
| Cooldown | 5 min per token | Wait |
| Min trade | $0.50 | Reject tiny trades |
| Max positions | 5 concurrent | Reject if full |

## Regime Modes

| Fear & Greed | Mode | Behavior |
|-------------|------|----------|
| < 35 | ACCUMULATE | Buy dips, larger positions (1.5x) |
| 35-65 | NEUTRAL | Standard DCA (1x) |
| > 65 | DEFENSIVE | No new buys, sell at profit targets |

## On-Chain Proof

- **TWAK Wallet:** `0xAFF744cf3faCe178ED38f9d4926F132b0cFD56C3`
- **ERC-8004 Agent ID:** 129251
- **Competition:** BNB HACK: AI TRADING AGENT EDITION
- **Chain:** BNB Smart Chain (BSC)

## Prize Targets

| Prize | Amount | Key Requirement |
|-------|--------|-----------------|
| Track 1st Place | $10,000 | Best autonomous agent + real PnL |
| Best Use of TWAK | $2,000 | Full self-custody, autonomous mode |
| Best Use of CMC Data | $2,000 | Deep MCP + Skills integration |
| Best Use of BNB SDK | $2,000 | ERC-8004 + ERC-8183 integration |

## License

MIT
