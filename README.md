# ICT Fear & Greed Rotation Agent

BNB Hack: AI Trading Agent Edition — CoinMarketCap × Trust Wallet

## Track
- **Track 1**: Autonomous Trading Agent (live PnL on BSC)
- **Track 2**: Strategy Skill (backtestable spec)

## Strategy: ICT + Fear & Greed Rotation

Combines Inner Circle Trader (ICT) technical methodology with CoinMarketCap's Fear & Greed Index and macro data to create a regime-aware autonomous trading agent on BSC.

### Core Logic
1. **Regime Detection** — CMC Fear & Greed Index determines trading mode
2. **ICT Analysis** — Market structure, OTE zones, Order Blocks, FVG, Elliott Wave
3. **Execution** — TWAK self-custody signing on BSC
4. **Risk Management** — Max 30% drawdown, per-trade stops, position sizing

### Stack
- CoinMarketCap API (Fear & Greed, listings, quotes, global metrics)
- Trust Wallet Agent Kit (TWAK) — self-custody execution
- BNB AI Agent SDK — BSC agent framework
- BNB Chain — execution layer

## Setup
```bash
cp .env.example .env
# Add CMC_API_KEY and wallet credentials
npm install
node index.js
```

## License
MIT
